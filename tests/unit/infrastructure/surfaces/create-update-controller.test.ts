/**
 * `createUpdateController` — the shared PUT/PATCH factory.
 *
 * The property under test is the pipeline the module docblock states: PUT fills every omitted
 * clearable field with `null` before handing the change-set to the module's own `update()`; PATCH
 * hands over only what the caller actually sent. `clearableFields` and `fillOmittedWithNull` are
 * pinned on their own too — every route's PUT depends on them, and a mutant in either would still
 * pass a route-level test that never omits a field.
 */
import { z } from 'zod';
import type { Request } from 'express';
import { asStub } from '@tests/stub';
import { makeResponseStub } from '@tests/express';
import { generateReject, generateSuccess } from '@infrastructure/http/response';
import { etagOf, fencedSave } from '@infrastructure/persistence/versioning';
import {
    clearableFields,
    createUpdateController,
    fillOmittedWithNull,
    type UpdateControllerSpec
} from '@infrastructure/surfaces/create-update-controller';

/** A believable ObjectId — `extractAndValidateId` refuses anything else with a 422. */
const VALID_ID = '507f1f77bcf86cd799439011';

/** A PUT schema with one required field, one clearable one, and one that cannot be `null`. */
const replaceSchema = z.strictObject({
    title: z.string().min(1),
    note: z.string().min(1).nullable().optional(),
    featured: z.boolean().optional()
});

/** The matching PATCH schema — every field optional. */
const patchSchema = replaceSchema.partial();

/** The spec every case starts from; each case overrides only what it is about. */
type WidgetSpec = UpdateControllerSpec<typeof replaceSchema, typeof patchSchema, unknown>;

/** A controller over {@link replaceSchema}, with a `update()` that succeeds unless overridden. */
const makeController = (overrides: Partial<WidgetSpec> = {}) =>
    createUpdateController({
        entity: 'widget',
        replaceSchema,
        patchSchema,
        update: jest.fn().mockResolvedValue(generateSuccess({ title: 'x' })),
        present: (row) => row,
        ...overrides
    });

/**
 * A request stub; `multipart` makes `request.is('multipart/form-data')` answer yes, `ifMatch` is
 * the `If-Match` header the caller sent.
 */
const makeRequest = (
    body: unknown,
    id: string | undefined = VALID_ID,
    multipart = false,
    ifMatch?: string
) =>
    asStub<Request>({
        params: { id },
        query: {},
        body,
        is: (type: string) => (multipart && type === 'multipart/form-data' ? type : false),
        get: (name: string) => (name === 'If-Match' ? ifMatch : undefined)
    });

/** The version a stored row was loaded at in the conditional-write cases. */
const LOADED_REVISION = 4;

describe('createUpdateController', () => {
    it('PUT fills an omitted clearable field with null', async () => {
        const update = jest.fn().mockResolvedValue(generateSuccess({ title: 'x' }));
        const { replace } = makeController({ update });

        await replace(makeRequest({ title: 'x' }), makeResponseStub());

        expect(update).toHaveBeenCalledWith(
            VALID_ID,
            { title: 'x', note: null },
            expect.anything()
        );
    });

    it('PUT hands the filled change-set to completeReplace, and update() gets its answer', async () => {
        const update = jest.fn().mockResolvedValue(generateSuccess({ title: 'x' }));
        const completeReplace = jest.fn().mockResolvedValue({ title: 'x', note: 'completed' });
        const { replace } = makeController({ update, completeReplace });

        await replace(makeRequest({ title: 'x' }), makeResponseStub());

        expect(completeReplace).toHaveBeenCalledWith(VALID_ID, { title: 'x', note: null });
        expect(update).toHaveBeenCalledWith(
            VALID_ID,
            { title: 'x', note: 'completed' },
            expect.anything()
        );
    });

    // The uploaded-file case: a client cannot send the current value back, so an omission keeps
    // it — but an explicit `null` still clears, as on any nullable field.
    it('PUT leaves a keptWhenOmitted field out of the change-set, yet still passes an explicit null', async () => {
        const update = jest.fn().mockResolvedValue(generateSuccess({ title: 'x' }));
        const { replace } = makeController({ update, keptWhenOmitted: ['note'] });

        await replace(makeRequest({ title: 'x' }), makeResponseStub());
        await replace(makeRequest({ title: 'x', note: null }), makeResponseStub());

        expect(update).toHaveBeenNthCalledWith(1, VALID_ID, { title: 'x' }, expect.anything());
        expect(update).toHaveBeenNthCalledWith(
            2,
            VALID_ID,
            { title: 'x', note: null },
            expect.anything()
        );
    });

    it('PATCH never runs completeReplace — an omission there leaves things alone', async () => {
        const completeReplace = jest.fn();
        const { update: patch } = makeController({ completeReplace });

        await patch(makeRequest({ title: 'x' }), makeResponseStub());

        expect(completeReplace).not.toHaveBeenCalled();
    });

    it('PATCH sends only what the caller actually sent, no filling', async () => {
        const update = jest.fn().mockResolvedValue(generateSuccess({ title: 'x' }));
        const { update: patch } = makeController({ update });

        await patch(makeRequest({ title: 'x' }), makeResponseStub());

        expect(update).toHaveBeenCalledWith(VALID_ID, { title: 'x' }, expect.anything());
    });

    it('PUT passes an explicit null straight through, not re-wrapped', async () => {
        const update = jest.fn().mockResolvedValue(generateSuccess({ title: 'x' }));
        const { replace } = makeController({ update });

        await replace(makeRequest({ title: 'x', note: null }), makeResponseStub());

        expect(update).toHaveBeenCalledWith(
            VALID_ID,
            { title: 'x', note: null },
            expect.anything()
        );
    });

    it('decodes a declared boolean off a multipart body before validating it', async () => {
        const update = jest.fn().mockResolvedValue(generateSuccess({ title: 'x' }));
        const { update: patch } = makeController({ update, input: { booleans: ['featured'] } });

        await patch(makeRequest({ featured: 'false' }, VALID_ID, true), makeResponseStub());

        expect(update).toHaveBeenCalledWith(VALID_ID, { featured: false }, expect.anything());
    });

    it('answers 422 for a malformed id, never reaching update', async () => {
        const update = jest.fn();
        const { update: patch } = makeController({ update });
        const response = makeResponseStub();

        await patch(makeRequest({ title: 'x' }, 'not-an-id'), response);

        expect(response.status).toHaveBeenCalledWith(422);
        expect(update).not.toHaveBeenCalled();
    });

    it('answers 422 for a schema violation, never reaching update', async () => {
        const update = jest.fn();
        const { update: patch } = makeController({ update });
        const response = makeResponseStub();

        // `title` violates `minLength: 1` once present but blank.
        await patch(makeRequest({ title: '' }), response);

        expect(response.status).toHaveBeenCalledWith(422);
        expect(update).not.toHaveBeenCalled();
    });

    it('sends the refusal the service returns, e.g. a 409', async () => {
        const { update: patch } = makeController({
            update: jest.fn().mockResolvedValue(generateReject(409, ['conflict']))
        });
        const response = makeResponseStub();

        await patch(makeRequest({ title: 'x' }), response);

        expect(response.status).toHaveBeenCalledWith(409);
    });

    it('responds through present() on success', async () => {
        const present = jest.fn((row: unknown) => ({ shaped: row }));
        const { update: patch } = makeController({ present });
        const response = makeResponseStub();

        await patch(makeRequest({ title: 'x' }), response);

        expect(response.status).toHaveBeenCalledWith(200);
        expect(response.json).toHaveBeenCalledWith(
            expect.objectContaining({ data: { shaped: { title: 'x' } } })
        );
    });

    it('reads the id from idFrom instead of the path, for a self-service resource like /account', async () => {
        const update = jest.fn().mockResolvedValue(generateSuccess({ title: 'x' }));
        const { update: patch } = makeController({ update, idFrom: () => 'the-callers-own-id' });

        // No `:id` at all — `idFrom` is the only source, exactly like `/account`'s own route.
        await patch(makeRequest({ title: 'x' }, undefined), makeResponseStub());

        expect(update).toHaveBeenCalledWith(
            'the-callers-own-id',
            { title: 'x' },
            expect.anything()
        );
    });
});

describe('clearableFields', () => {
    it('lists exactly the fields that accept null', () => {
        // `title` is required, `featured` optional but never null — neither is a PUT's to clear.
        expect(clearableFields(replaceSchema)).toEqual(['note']);
    });
});

describe('fillOmittedWithNull', () => {
    it('leaves a present field alone', () => {
        expect(fillOmittedWithNull({ a: 1 }, ['a', 'b'])).toEqual({ a: 1, b: null });
    });

    it('fills every declared field that is absent, and only those', () => {
        expect(fillOmittedWithNull({}, ['a', 'b', 'c'])).toEqual({ a: null, b: null, c: null });
    });

    it('does not touch a field the schema never declared', () => {
        // A change-set is built from a VALIDATED body, so an undeclared key should not exist —
        // this pins that this helper does not itself introduce one.
        expect(fillOmittedWithNull({ extra: 'x' }, ['a'])).toEqual({ extra: 'x', a: null });
    });

    it('never mutates the body it was given', () => {
        const body = { a: 1 };
        fillOmittedWithNull(body, ['a', 'b']);
        expect(body).toEqual({ a: 1 });
    });
});

/** An `update()` that saves a row loaded at {@link LOADED_REVISION}, the way a service does. */
const savingUpdate = (write: jest.Mock) =>
    jest.fn(() =>
        fencedSave({ _id: VALID_ID, editRevision: LOADED_REVISION }, write).then(() =>
            generateSuccess({ title: 'x', editRevision: LOADED_REVISION })
        )
    );

/** A response that can take the `ETag` header the saved row now carries. */
const makeResponse = () =>
    Object.assign(makeResponseStub(), { setHeader: jest.fn(), req: { headers: {} } });

describe('createUpdateController — conditional writes', () => {
    it('answers 412 and never writes when If-Match is stale', async () => {
        const write = jest.fn().mockResolvedValue(undefined);
        const { update: patch } = makeController({ update: savingUpdate(write) });
        const response = makeResponse();

        await patch(makeRequest({ title: 'x' }, VALID_ID, false, '"1"'), response);

        expect(response.status).toHaveBeenCalledWith(412);
        expect(write).not.toHaveBeenCalled();
    });

    it('writes when If-Match names the version the row was loaded at', async () => {
        const write = jest.fn().mockResolvedValue(undefined);
        const { replace } = makeController({ update: savingUpdate(write) });
        const response = makeResponse();

        await replace(
            makeRequest({ title: 'x' }, VALID_ID, false, etagOf(LOADED_REVISION)),
            response
        );

        expect(response.status).toHaveBeenCalledWith(200);
        expect(write).toHaveBeenCalledTimes(1);
    });

    it('writes as it always did when there is no If-Match', async () => {
        const write = jest.fn().mockResolvedValue(undefined);
        const { update: patch } = makeController({ update: savingUpdate(write) });
        const response = makeResponse();

        await patch(makeRequest({ title: 'x' }), response);

        expect(response.status).toHaveBeenCalledWith(200);
        expect(write).toHaveBeenCalledTimes(1);
    });

    it("answers the saved row's new ETag", async () => {
        const response = makeResponse();
        const saved = generateSuccess({ title: 'x', editRevision: LOADED_REVISION });
        const { update: patch } = makeController({ update: jest.fn().mockResolvedValue(saved) });

        await patch(makeRequest({ title: 'x' }), response);

        expect(response.setHeader).toHaveBeenCalledWith('ETag', etagOf(LOADED_REVISION));
    });
});
