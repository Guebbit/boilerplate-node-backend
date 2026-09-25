/**
 * `createUpdateController` — AUDIT_0924 D17's shared PUT/PATCH factory.
 *
 * The property under test is the pipeline the module docblock states: PUT fills every omitted
 * writable field with `null` before handing the change-set to the module's own `update()`; PATCH
 * hands over only what the caller actually sent. `clearedOrValue` and `fillOmittedWithNull` are
 * pinned on their own too — they are the two facts every module's `update()` and every route's
 * PUT depend on, and a mutant in either would still pass a route-level test that never sends a
 * `null`.
 */
import { z } from 'zod';
import type { Request } from 'express';
import { asStub } from '@tests/stub';
import { makeResponseStub } from '@tests/express';
import { generateReject, generateSuccess } from '@infrastructure/http/response';
import {
    clearedOrValue,
    createUpdateController,
    fillOmittedWithNull
} from '@infrastructure/surfaces/create-update-controller';
import { emitAuditEvent, coreAuditActions } from '@infrastructure/observability/audit';

// Only the sink is replaced, same pattern as `tests/unit/kernel/authorizations.test.ts` — the
// real `buildAuditEvent`/`recordAudit` stay in force so a shape drift fails here.
jest.mock('@infrastructure/observability/audit', () => {
    const actual = jest.requireActual<typeof import('@infrastructure/observability/audit')>(
        '@infrastructure/observability/audit'
    );
    const emitAuditEvent = jest.fn();
    return {
        ...actual,
        emitAuditEvent,
        recordAudit: (
            context: Parameters<typeof actual.recordAudit>[0],
            fields: Parameters<typeof actual.recordAudit>[1]
        ) => {
            if (!context) return;
            emitAuditEvent(actual.buildAuditEvent(context, fields));
        }
    };
});

const mockedEmitAuditEvent = emitAuditEvent as jest.MockedFunction<typeof emitAuditEvent>;

/** A believable ObjectId — `extractAndValidateId` refuses anything else with a 422. */
const VALID_ID = '507f1f77bcf86cd799439011';

const replaceSchema = z.object({
    title: z.string().min(1),
    note: z.string().min(1).nullable().optional()
});
const patchSchema = replaceSchema.partial();

const makeRequest = (body: unknown, id: string | undefined = VALID_ID) =>
    asStub<Request>({
        params: { id },
        query: {},
        body,
        is: () => false
    });

describe('createUpdateController', () => {
    it('PUT fills an omitted optional field with null', async () => {
        const update = jest.fn().mockResolvedValue(generateSuccess({ title: 'x' }));
        const { replace } = createUpdateController({
            entity: 'widget',
            replaceSchema,
            patchSchema,
            writableFields: ['title', 'note'],
            update,
            present: (row) => row,
            auditAction: coreAuditActions.SECURITY_FORBIDDEN,
            notFoundKey: 'widgets.not-found'
        });

        await replace(makeRequest({ title: 'x' }), makeResponseStub());

        expect(update).toHaveBeenCalledWith(
            VALID_ID,
            { title: 'x', note: null },
            expect.anything()
        );
    });

    it('PATCH sends only what the caller actually sent, no filling', async () => {
        const update = jest.fn().mockResolvedValue(generateSuccess({ title: 'x' }));
        const { patch } = createUpdateController({
            entity: 'widget',
            replaceSchema,
            patchSchema,
            writableFields: ['title', 'note'],
            update,
            present: (row) => row,
            auditAction: coreAuditActions.SECURITY_FORBIDDEN,
            notFoundKey: 'widgets.not-found'
        });

        await patch(makeRequest({ title: 'x' }), makeResponseStub());

        expect(update).toHaveBeenCalledWith(VALID_ID, { title: 'x' }, expect.anything());
    });

    it('PUT passes an explicit null straight through, not re-wrapped', async () => {
        const update = jest.fn().mockResolvedValue(generateSuccess({ title: 'x' }));
        const { replace } = createUpdateController({
            entity: 'widget',
            replaceSchema,
            patchSchema,
            writableFields: ['title', 'note'],
            update,
            present: (row) => row,
            auditAction: coreAuditActions.SECURITY_FORBIDDEN,
            notFoundKey: 'widgets.not-found'
        });

        await replace(makeRequest({ title: 'x', note: null }), makeResponseStub());

        expect(update).toHaveBeenCalledWith(
            VALID_ID,
            { title: 'x', note: null },
            expect.anything()
        );
    });

    it('answers 422 for a malformed id, never reaching update', async () => {
        const update = jest.fn();
        const { patch } = createUpdateController({
            entity: 'widget',
            replaceSchema,
            patchSchema,
            writableFields: ['title', 'note'],
            update,
            present: (row) => row,
            auditAction: coreAuditActions.SECURITY_FORBIDDEN,
            notFoundKey: 'widgets.not-found'
        });
        const response = makeResponseStub();

        await patch(makeRequest({ title: 'x' }, 'not-an-id'), response);

        expect(response.status).toHaveBeenCalledWith(422);
        expect(update).not.toHaveBeenCalled();
    });

    it('answers 422 for a schema violation, never reaching update', async () => {
        const update = jest.fn();
        const { patch } = createUpdateController({
            entity: 'widget',
            replaceSchema,
            patchSchema,
            writableFields: ['title', 'note'],
            update,
            present: (row) => row,
            auditAction: coreAuditActions.SECURITY_FORBIDDEN,
            notFoundKey: 'widgets.not-found'
        });
        const response = makeResponseStub();

        // `title` violates `minLength: 1` once present but blank.
        await patch(makeRequest({ title: '' }), response);

        expect(response.status).toHaveBeenCalledWith(422);
        expect(update).not.toHaveBeenCalled();
    });

    it('sends the refusal the service returns, e.g. a 409, without auditing success', async () => {
        const update = jest.fn().mockResolvedValue(generateReject(409, ['conflict']));
        const { patch } = createUpdateController({
            entity: 'widget',
            replaceSchema,
            patchSchema,
            writableFields: ['title', 'note'],
            update,
            present: (row) => row,
            auditAction: coreAuditActions.SECURITY_FORBIDDEN,
            notFoundKey: 'widgets.not-found'
        });
        const response = makeResponseStub();

        await patch(makeRequest({ title: 'x' }), response);

        expect(response.status).toHaveBeenCalledWith(409);
        expect(mockedEmitAuditEvent).not.toHaveBeenCalled();
    });

    it('audits and responds through present() on success', async () => {
        const update = jest.fn().mockResolvedValue(generateSuccess({ title: 'x', id: VALID_ID }));
        const present = jest.fn((row: { title: string }) => ({ shaped: row.title }));
        const { patch } = createUpdateController({
            entity: 'widget',
            replaceSchema,
            patchSchema,
            writableFields: ['title', 'note'],
            update,
            present,
            auditAction: coreAuditActions.SECURITY_FORBIDDEN,
            notFoundKey: 'widgets.not-found'
        });
        const response = makeResponseStub();

        await patch(makeRequest({ title: 'x' }), response);

        expect(present).toHaveBeenCalled();
        expect(response.status).toHaveBeenCalledWith(200);
        expect(response.json).toHaveBeenCalledWith(
            expect.objectContaining({ data: { shaped: 'x' } })
        );
        expect(mockedEmitAuditEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                action: coreAuditActions.SECURITY_FORBIDDEN,
                target_type: 'widget',
                target_id: VALID_ID,
                outcome: 'success'
            })
        );
    });

    it('reads the id from idFrom instead of the path, for a self-service resource like /account', async () => {
        const update = jest.fn().mockResolvedValue(generateSuccess({ title: 'x' }));
        const { patch } = createUpdateController({
            entity: 'widget',
            replaceSchema,
            patchSchema,
            writableFields: ['title', 'note'],
            update,
            present: (row) => row,
            notFoundKey: 'widgets.not-found',
            idFrom: () => 'the-callers-own-id'
        });

        // No `:id` at all — `idFrom` is the only source, exactly like `/account`'s own route.
        await patch(makeRequest({ title: 'x' }, undefined), makeResponseStub());

        expect(update).toHaveBeenCalledWith('the-callers-own-id', { title: 'x' }, expect.anything());
    });

    it('never audits on its own when auditAction is omitted, trusting update() already did', async () => {
        // DM2 (DECISION_MADE.md): every module wired to this factory so far already calls
        // `recordAudit` inside its own `update()` — a static action here on top of that would
        // double-log every successful update, not add a second, less specific entry on purpose.
        const update = jest.fn().mockResolvedValue(generateSuccess({ title: 'x', id: VALID_ID }));
        const { patch } = createUpdateController({
            entity: 'widget',
            replaceSchema,
            patchSchema,
            writableFields: ['title', 'note'],
            update,
            present: (row) => row,
            notFoundKey: 'widgets.not-found'
        });
        const response = makeResponseStub();

        await patch(makeRequest({ title: 'x' }), response);

        expect(response.status).toHaveBeenCalledWith(200);
        expect(mockedEmitAuditEvent).not.toHaveBeenCalled();
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

describe('clearedOrValue', () => {
    it('turns null into undefined, for $unset on save', () => {
        expect(clearedOrValue(null)).toBeUndefined();
    });

    it('leaves every other value exactly as it was', () => {
        expect(clearedOrValue('x')).toBe('x');
        expect(clearedOrValue(0)).toBe(0);
        expect(clearedOrValue(false)).toBe(false);
    });
});
