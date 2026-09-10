/**
 * Unit tests for `idempotencyKey`'s fingerprint. The fingerprint's own bytes are not the point —
 * what has to hold is that two logically-equal bodies produce the SAME one and two different
 * ones do not. Asserted through the model call the middleware makes — its "public door" — with
 * `idempotency-model` mocked so no database is needed. Real-database behaviour — the
 * 409/422/replay outcomes — is covered in `tests/contract/idempotency.test.ts`.
 */

import { asStub } from '@tests/stub';
import { makeResponseStub } from '@tests/express';
import type { Request } from 'express';

jest.mock('@infrastructure/http/middlewares/idempotency-model', () => ({
    idempotencyRecordModel: {
        create: jest.fn(),
        updateOne: jest.fn(() => ({ exec: () => Promise.resolve(undefined) })),
        findOne: jest.fn(() => ({ lean: () => ({ exec: () => Promise.resolve(null) }) }))
    }
}));

import { idempotencyRecordModel } from '@infrastructure/http/middlewares/idempotency-model';
import { idempotencyKey } from '@infrastructure/http/middlewares/idempotency';

const create = idempotencyRecordModel.create as jest.Mock;

/** Lets a pending promise chain (the mocked `create().then(...)`) settle before assertions run. */
const flush = () => new Promise((resolve) => setImmediate(resolve));

/** A minimal request carrying only what `idempotencyKey` reads. */
const makeRequest = (key: string | undefined, body: unknown) =>
    asStub<Request>({
        header: (name: string) => (name.toLowerCase() === 'idempotency-key' ? key : undefined),
        method: 'POST',
        baseUrl: '',
        path: '/widgets',
        route: { path: '/widgets' },
        body,
        ip: '127.0.0.1'
    });

describe('idempotencyKey', () => {
    beforeEach(() => {
        create.mockReset();
        create.mockResolvedValue(undefined);
    });

    it("fingerprints identically regardless of the body's key order", async () => {
        const next = jest.fn();

        idempotencyKey(makeRequest('key-1', { a: 1, b: 2 }), makeResponseStub(), next);
        await flush();
        idempotencyKey(makeRequest('key-2', { b: 2, a: 1 }), makeResponseStub(), next);
        await flush();

        expect(create).toHaveBeenCalledTimes(2);
        const [[first], [second]] = create.mock.calls as [{ fingerprint: string }][];
        expect(first.fingerprint).toBe(second.fingerprint);
    });

    it('fingerprints differently when a value changes', async () => {
        const next = jest.fn();

        idempotencyKey(makeRequest('key-1', { a: 1 }), makeResponseStub(), next);
        await flush();
        idempotencyKey(makeRequest('key-2', { a: 2 }), makeResponseStub(), next);
        await flush();

        const [[first], [second]] = create.mock.calls as [{ fingerprint: string }][];
        expect(first.fingerprint).not.toBe(second.fingerprint);
    });

    it('is a no-op — never touches the ledger, calls next() straight through — with no key', () => {
        const next = jest.fn();

        idempotencyKey(makeRequest(undefined, { a: 1 }), makeResponseStub(), next);

        expect(next).toHaveBeenCalledWith();
        expect(create).not.toHaveBeenCalled();
    });

    it('rejects a key outside the declared length/character class before touching the ledger', () => {
        const response = makeResponseStub();

        idempotencyKey(makeRequest('not a legal key!', { a: 1 }), response, jest.fn());

        expect(response.status).toHaveBeenCalledWith(422);
        expect(response.json).toHaveBeenCalledWith(
            expect.objectContaining({
                errors: [expect.objectContaining({ code: 'VALIDATION_ERROR' })]
            })
        );
        expect(create).not.toHaveBeenCalled();
    });
});
