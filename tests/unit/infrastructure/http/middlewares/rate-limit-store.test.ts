/**
 * One connection needs one `connect()`.
 *
 * This is the fast guard on the bug `tests/cluster/rate-limit.test.ts` found: with a `connect()`
 * per command, two commands issued before the handshake finishes both try to open the same socket.
 * `isReady` stays false for the whole handshake, so both see it as false; node-redis rejects the
 * second with `Socket already opened`, and that failure path discards the client the FIRST one is
 * still using, which then fails with `The client is closed`.
 *
 * The interleaving is not rare — it is guaranteed. `RedisStore.init()` loads two Lua scripts back
 * to back, so the pair raced on the very first request of every worker, every request afterwards
 * passed unbudgeted, and the log reported Redis as unreachable while Redis was answering fine. A
 * rate limiter that is off is a security control that is off.
 *
 * ── Why this exists as well as the cluster suite ──────────────────────────────────────────────
 * The cluster suite proves the whole property — one budget spent across real forked workers — and
 * costs 25 seconds and a container, so it runs in `complete:manual` and in CI rather than in
 * `npm test`. That left the fix itself unguarded in the gate a contributor actually runs. This
 * file closes exactly that: no cluster, no Redis, no container, and it fails on the same
 * regression.
 */

import { stopLimitsRedis } from '@infrastructure/adapters/limits-redis';
import { rateLimitStore } from '@infrastructure/http/middlewares/rate-limit-store';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Request, RequestHandler } from 'express';
import { setEnvironment } from '@tests/environment';
import { asStub } from '@tests/stub';
import { withReloadedRateLimits } from '@tests/rate-limit-harness';
import type { AuthContext } from '@types';

/** How many times a `connect()` was asked for across the run, whatever the client instance. */
let connectCalls = 0;

/**
 * A client that behaves the way the real one does at the only moment that matters: `isReady` stays
 * false until the handshake resolves, and a second `connect()` while one is in flight throws — the
 * error node-redis raises, which is what made the original failure destructive rather than merely
 * duplicated.
 */
type FakeClient = ReturnType<typeof fakeClient>;

const fakeClient = () => {
    let ready = false;
    let opening = false;

    return {
        get isReady() {
            return ready;
        },
        connect: jest.fn(() => {
            connectCalls += 1;
            if (opening || ready) throw new Error('Socket already opened');
            opening = true;

            return new Promise((resolve) =>
                setTimeout(() => {
                    opening = false;
                    ready = true;
                    resolve(undefined);
                }, 10)
            );
        }),
        /*
         * Replies shaped the way `rate-limit-redis` insists on: `SCRIPT LOAD` must answer a string
         * sha or it throws before the connection is ever exercised, and the increment script
         * answers `[totalHits, resetMs]`.
         */
        sendCommand: jest.fn((command: string[]) =>
            Promise.resolve(command[0] === 'SCRIPT' ? 'a-fake-sha' : [1, 60_000])
        ),
        on: jest.fn(),
        destroy: jest.fn(() => {
            ready = false;
            opening = false;
        }),
        close: jest.fn(() => Promise.resolve())
    };
};

/**
 * The seam the mock factory reads.
 *
 * `jest.mock` factories are hoisted above every `const` in the file, so the factory cannot close
 * over a module-scoped variable — it has to reach the client through something that exists at call
 * time. A property on `globalThis` is that something.
 */
const seam = globalThis as typeof globalThis & { rateLimitFakeClient?: FakeClient };

jest.mock('redis', () => ({
    createClient: jest.fn(() => (globalThis as typeof seam).rateLimitFakeClient)
}));

describe('the rate limiter’s Redis connection', () => {
    beforeEach(() => {
        connectCalls = 0;
        seam.rateLimitFakeClient = fakeClient();
        setEnvironment({ NODE_RATE_LIMIT_REDIS_URL: 'redis://127.0.0.1:6379' });
    });

    afterEach(() => stopLimitsRedis());

    it('opens one socket for commands issued before the handshake finishes', () => {
        /*
         * The regression. Two commands, neither awaiting the other — which is what `RedisStore`
         * does with its two script loads — and exactly one `connect()`.
         */
        const store = rateLimitStore('unit');
        void store.init?.({ windowMs: 60_000 } as never);

        return Promise.all([store.increment('a'), store.increment('b')]).then(() => {
            expect(connectCalls).toBe(1);
        });
    });

    it('answers both of them rather than destroying the client one is using', () => {
        /*
         * The consequence, asserted separately: the original failure was not a duplicate connect
         * but what the duplicate's rejection did — `destroy()` on the shared client, so the command
         * that had done nothing wrong failed too and the limiter passed the request through.
         */
        const store = rateLimitStore('unit');
        void store.init?.({ windowMs: 60_000 } as never);

        return Promise.all([store.increment('a'), store.increment('b')]).then((results) => {
            expect(results).toHaveLength(2);
            expect(seam.rateLimitFakeClient?.destroy).not.toHaveBeenCalled();
        });
    });

    it('counts in memory when no Redis is configured', () => {
        // The other half of the choice, so the case above cannot pass by never reaching Redis.
        setEnvironment({ NODE_RATE_LIMIT_REDIS_URL: undefined });

        const store = rateLimitStore('unit');
        void store.init?.({ windowMs: 60_000 } as never);

        return Promise.resolve(store.increment('a')).then(() => {
            expect(connectCalls).toBe(0);
        });
    });
});

/*
 * Two budgets keyed alike on one request are two counters, not one hit counted twice.
 *
 * `POST /payments/:id/confirm` mounts the attempt and the decline budgets, both keyed on the
 * account. With the limits Redis configured, `express-rate-limit` tells stores apart by their
 * `prefix`; a store without one made the pair read as `ERR_ERL_DOUBLE_COUNT`. The Redis here is
 * unreachable on purpose: the counters fall back to memory, but the store wrappers are the same
 * ones a working Redis runs behind. It is the one case that fails if the store's `prefix` is
 * dropped.
 */

/** Stands in for `getAuth` resolving one account — only `.id` is read by `accountIdOf`. */
const asAccount = (id: string): RequestHandler => {
    return (request: Request, _response, next) => {
        request.authContext = asStub<AuthContext>({ id });
        next();
    };
};

describe('payment budgets keyed on the same account, counted through a Redis-backed store', () => {
    afterEach(() => {
        jest.restoreAllMocks();
        jest.resetModules();
    });

    it('are not reported as one hit counted twice on POST /payments/:id/confirm', async () => {
        const reported: string[] = [];
        const { attempt, decline } = await withReloadedRateLimits(
            async () => {
                const { logger } = await import('@infrastructure/adapters/logger');
                jest.spyOn(logger, 'error').mockImplementation((...problems: unknown[]) => {
                    for (const problem of problems)
                        if (problem instanceof Error)
                            reported.push((problem as { code?: string }).code ?? problem.message);
                });
                return import('@modules/payments/rate-limits');
            },
            { NODE_RATE_LIMIT_REDIS_URL: 'redis://127.0.0.1:1' },
            (limits) => ({
                attempt: limits.paymentConfirmAttemptLimiter,
                decline: limits.paymentConfirmDeclineLimiter
            })
        );

        const app = express();
        app.use(asAccount('account-1'));
        app.post('/confirm', attempt, decline, (_request, response) => {
            response.status(200).json({ success: true });
        });
        // A real listener and `fetch`, not supertest: this is a store test, and a unit test may not
        // boot the app. Port 0 asks the OS for a free one.
        const server = app.listen(0);
        try {
            const { port } = server.address() as AddressInfo;
            const answer = await fetch(`http://127.0.0.1:${String(port)}/confirm`, {
                method: 'POST'
            });
            expect(answer.status).toBe(200);
        } finally {
            server.close();
        }

        expect(reported).not.toContain('ERR_ERL_DOUBLE_COUNT');
    });
});
