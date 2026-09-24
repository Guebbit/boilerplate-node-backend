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
const updateOne = idempotencyRecordModel.updateOne as jest.Mock;
const findOne = idempotencyRecordModel.findOne as jest.Mock;

/** Lets a pending promise chain (the mocked `create().then(...)`) settle before assertions run. */
const flush = () => new Promise((resolve) => setImmediate(resolve));

/** A minimal request carrying only what `idempotencyKey` reads. */
const makeRequest = (key: string | undefined, body: unknown, path = '/widgets') =>
    asStub<Request>({
        header: (name: string) => (name.toLowerCase() === 'idempotency-key' ? key : undefined),
        method: 'POST',
        baseUrl: '',
        path,
        route: { path: '/widgets/:id' },
        body,
        ip: '127.0.0.1'
    });

/** The fingerprint `key-1` + `{ a: 1 }` produces, read back off a first claim. */
const fingerprintOfFirstClaim = async (): Promise<string> => {
    idempotencyKey(makeRequest('key-1', { a: 1 }), makeResponseStub(), jest.fn());
    await flush();
    return (create.mock.calls[0] as [{ fingerprint: string }])[0].fingerprint;
};

/** Collide once, against an in-flight record last touched `ageMs` ago. */
const collideWithInFlight = (fingerprint: string, ageMs: number) => {
    create.mockRejectedValueOnce({ code: 11_000 });
    findOne.mockReturnValueOnce({
        lean: () => ({
            exec: () =>
                Promise.resolve({
                    state: 'in-flight',
                    fingerprint,
                    updatedAt: new Date(Date.now() - ageMs)
                })
        })
    });
};

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

    it("fingerprints identically regardless of a NESTED object's key order", async () => {
        // `idempotency.ts`'s own doc says `canonicalize` sorts keys recursively, not just at the
        // top level — this is the case that actually exercises the recursive half of that claim.
        const next = jest.fn();

        idempotencyKey(
            makeRequest('key-1', { outer: { a: 1, b: 2 }, z: true }),
            makeResponseStub(),
            next
        );
        await flush();
        idempotencyKey(
            makeRequest('key-2', { outer: { b: 2, a: 1 }, z: true }),
            makeResponseStub(),
            next
        );
        await flush();

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

    it('fingerprints two resources behind one route template differently', async () => {
        // An empty-bodied write per resource, e.g. a refund of order A then order B: one
        // fingerprint for both would replay A's answer for B.
        const next = jest.fn();

        idempotencyKey(makeRequest('key-1', {}, '/widgets/a'), makeResponseStub(), next);
        await flush();
        idempotencyKey(makeRequest('key-2', {}, '/widgets/b'), makeResponseStub(), next);
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

    /**
     * `canonicalize` (`@guebbit/js-toolkit` 2.2.0) drops an own `__proto__` key instead of
     * carrying it into the fingerprint — see `hasProtoKey`'s own doc in `idempotency.ts`. Refused
     * before the ledger is ever touched, the same shape as an invalid key above, rather than
     * silently computing a fingerprint that ignores part of the body.
     */
    it.each([
        ['at the top level', '{"__proto__":{"polluted":true},"a":1}'],
        ['nested inside the body', '{"nested":{"__proto__":{"polluted":true}}}'],
        ['inside an array element', '{"items":[{"__proto__":{"polluted":true}}]}']
    ])('refuses a body with __proto__ %s, before touching the ledger', (_label, json) => {
        const response = makeResponseStub();

        // Parsed from a JSON STRING, the way express's body parser actually produces
        // `request.body` — that is what gives `__proto__` an own key. A hand-written object
        // literal's `__proto__: {...}` sets the prototype instead, which this fixture must avoid.
        const body: unknown = JSON.parse(json);

        idempotencyKey(makeRequest('key-1', body), response, jest.fn());

        expect(response.status).toHaveBeenCalledWith(422);
        expect(response.json).toHaveBeenCalledWith(
            expect.objectContaining({
                errors: [expect.objectContaining({ code: 'VALIDATION_ERROR' })]
            })
        );
        expect(create).not.toHaveBeenCalled();
    });

    it('runs normally for a body with a merely proto-LIKE key, never confusing it for the real one', async () => {
        const next = jest.fn();

        idempotencyKey(
            makeRequest('key-1', { protoype: 1, __proto_: 2 }),
            makeResponseStub(),
            next
        );
        await flush();

        expect(create).toHaveBeenCalledTimes(1);
    });

    /**
     * The collision branch is the NORMAL path for a retried request — a failure in its own lookup
     * must still answer through `next(error)` rather than leave the promise chain to reject
     * unhandled, which would hang the client's retry until its own timeout.
     */
    it('answers via next(error) when the replay lookup fails after a collision', async () => {
        const next = jest.fn();
        const duplicateKeyError = { code: 11_000 };
        const lookupError = new Error('replica set failover mid-read');
        create.mockRejectedValueOnce(duplicateKeyError);
        findOne.mockReturnValueOnce({ lean: () => ({ exec: () => Promise.reject(lookupError) }) });

        idempotencyKey(makeRequest('key-1', { a: 1 }), makeResponseStub(), next);
        await flush();
        await flush();

        expect(next).toHaveBeenCalledWith(lookupError);
    });

    /**
     * The vanished-record case: the row that caused the E11000 is gone by the time the lookup
     * reads it back — TTL reclaimed it in the window between the failed insert and this read.
     * The slot is genuinely open again, so this retries the create once rather than falling
     * through to an uncaptured `next()`.
     */
    it('retries the create once when the colliding record has already vanished, and succeeds', async () => {
        const next = jest.fn();
        create.mockRejectedValueOnce({ code: 11_000 });
        findOne.mockReturnValueOnce({ lean: () => ({ exec: () => Promise.resolve(null) }) });

        idempotencyKey(makeRequest('key-1', { a: 1 }), makeResponseStub(), next);
        await flush();
        await flush();

        // The retried create isn't rejected (the default mock from beforeEach), so this run
        // claims the key on its second attempt rather than running uncaptured.
        expect(create).toHaveBeenCalledTimes(2);
        expect(next).toHaveBeenCalledWith();
    });

    it('gives up after one retry also finds nothing, running the handler uncaptured', async () => {
        const next = jest.fn();
        create.mockRejectedValueOnce({ code: 11_000 });
        create.mockRejectedValueOnce({ code: 11_000 });
        findOne.mockReturnValueOnce({ lean: () => ({ exec: () => Promise.resolve(null) }) });
        findOne.mockReturnValueOnce({ lean: () => ({ exec: () => Promise.resolve(null) }) });

        idempotencyKey(makeRequest('key-1', { a: 1 }), makeResponseStub(), next);
        await flush();
        await flush();
        await flush();

        // Retried exactly once, not indefinitely — the second vanished lookup gives up rather
        // than looping, and the request still proceeds (uncaptured) instead of hanging.
        expect(create).toHaveBeenCalledTimes(2);
        expect(next).toHaveBeenCalledWith();
    });

    describe('an in-flight record', () => {
        it('answers 409 while the attempt holding the key may still be running', async () => {
            const fingerprint = await fingerprintOfFirstClaim();
            collideWithInFlight(fingerprint, 1000);
            const response = makeResponseStub();
            const next = jest.fn();

            idempotencyKey(makeRequest('key-1', { a: 1 }), response, next);
            await flush();
            await flush();

            expect(response.status).toHaveBeenCalledWith(409);
            expect(next).not.toHaveBeenCalled();
        });

        it('lets a retry take over a key whose attempt died long ago', async () => {
            const fingerprint = await fingerprintOfFirstClaim();
            collideWithInFlight(fingerprint, 60 * 60_000);
            updateOne.mockReturnValueOnce({ exec: () => Promise.resolve({ modifiedCount: 1 }) });
            const next = jest.fn();

            idempotencyKey(makeRequest('key-1', { a: 1 }), makeResponseStub(), next);
            await flush();
            await flush();

            expect(next).toHaveBeenCalledWith();
        });

        it('answers 409 to the retry that loses the race for a dead attempt', async () => {
            const fingerprint = await fingerprintOfFirstClaim();
            collideWithInFlight(fingerprint, 60 * 60_000);
            updateOne.mockReturnValueOnce({ exec: () => Promise.resolve({ modifiedCount: 0 }) });
            const response = makeResponseStub();
            const next = jest.fn();

            idempotencyKey(makeRequest('key-1', { a: 1 }), response, next);
            await flush();
            await flush();

            expect(response.status).toHaveBeenCalledWith(409);
            expect(next).not.toHaveBeenCalled();
        });
    });
});
