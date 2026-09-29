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

/** A request stub; `multipart` makes `request.is('multipart/form-data')` answer yes. */
const makeRequest = (body: unknown, id: string | undefined = VALID_ID, multipart = false) =>
    asStub<Request>({
        params: { id },
        query: {},
        body,
        is: (type: string) => (multipart && type === 'multipart/form-data' ? type : false)
    });

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
