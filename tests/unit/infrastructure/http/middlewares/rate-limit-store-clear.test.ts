/**
 * `clearRateLimitCounters` — what the e2e reset uses so a spent budget does not outlive the data.
 *
 * Asserts the scope (only the limiter's own prefix, never a flush), the fail-open answer, and that
 * the short-lived client is always closed.
 */

import { clearRateLimitCounters } from '@infrastructure/http/middlewares/rate-limit-store';

/** Recorded per test: the pattern SCAN was asked for, and every key DEL removed. */
const calls = { patterns: [] as string[], deleted: [] as string[][], closed: 0 };

/** Set by a case to make `connect()` reject. */
let connectError: Error | undefined;

/** A node-redis stand-in: two SCAN batches, one of them empty. */
const fakeClient = () => ({
    on: jest.fn(),
    connect: jest.fn(() => (connectError ? Promise.reject(connectError) : Promise.resolve())),
    // eslint-disable-next-line @typescript-eslint/require-await -- the async generator is the contract: scanIterator is an AsyncIterable
    scanIterator: jest.fn(async function* (options: { MATCH: string }) {
        calls.patterns.push(options.MATCH);
        yield ['rate-limit:auth:a', 'rate-limit:payments:b'];
        yield [];
    }),
    del: jest.fn((keys: string[]) => {
        calls.deleted.push(keys);
        return Promise.resolve(keys.length);
    }),
    close: jest.fn(() => {
        calls.closed += 1;
        return Promise.resolve();
    }),
    destroy: jest.fn()
});

jest.mock('redis', () => ({ createClient: jest.fn(() => fakeClient()) }));

jest.mock('@infrastructure/adapters/logger', () => ({
    logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() }
}));

describe('clearRateLimitCounters', () => {
    beforeEach(() => {
        calls.patterns = [];
        calls.deleted = [];
        calls.closed = 0;
        connectError = undefined;
    });

    it('deletes only keys under the limiter prefix, and counts them', async () => {
        await expect(clearRateLimitCounters('redis://127.0.0.1:6379')).resolves.toEqual({
            deleted: 2,
            reachable: true
        });
        expect(calls.patterns).toEqual(['rate-limit:*']);
        expect(calls.deleted).toEqual([['rate-limit:auth:a', 'rate-limit:payments:b']]);
    });

    it('closes the client it opened', async () => {
        await clearRateLimitCounters('redis://127.0.0.1:6379');
        expect(calls.closed).toBe(1);
    });

    it('has nothing to clear without a Redis URL', async () => {
        await expect(clearRateLimitCounters(undefined)).resolves.toEqual({
            deleted: 0,
            reachable: true
        });
        expect(calls.patterns).toEqual([]);
    });

    it('answers reachable: false instead of rejecting when Redis is down', async () => {
        connectError = new Error('ECONNREFUSED');
        await expect(clearRateLimitCounters('redis://127.0.0.1:6379')).resolves.toEqual({
            deleted: 0,
            reachable: false
        });
        expect(calls.closed).toBe(1);
    });
});
