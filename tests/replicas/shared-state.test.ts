/**
 * @module
 * Three pieces of state that must live in the stores, not in a copy: the rate-limit budget, the
 * session, and the idempotency ledger. Each is invisible to a one-process test, because one
 * process cannot tell a shared counter from a private one.
 *
 * Every case ends on a control that fails when the rig is broken: the proxy's spread shows at
 * least two copies answered, or the assertion is about a second copy by name, so "shared" cannot
 * be the answer of a single copy doing all the work.
 *
 * @see docs/build/replicas-testing.md#the-multi-copy-suite
 */

import { containerEngineAvailable } from '@tests/container-engine';
import { startRedis, type TestRedis } from './support/redis';
import { call, jsonHeaders, signUpAndLogIn } from './support/client';
import { BOOT_TIMEOUT_MS, withReplicas } from './support/copies';

/** Copies behind the proxy. */
const COPIES = 3;

/** Copies boot one after another, each within its own deadline; the margin covers a Redis pull. */
jest.setTimeout(COPIES * BOOT_TIMEOUT_MS + 120_000);

/** An address body the contract accepts. */
const ADDRESS = {
    fullName: 'A B',
    street: 'Via Roma 1',
    city: 'Milano',
    zip: '20100',
    country: 'IT'
};

/**
 * Counters live under a prefix unique per run: a shared Redis remembers, and a second run inside
 * the window would start against a budget the first had already spent.
 */
const keyPrefix = () => `replicas-test-${String(process.pid)}-${String(Date.now())}`;

describe('state shared by every copy', () => {
    let redis: TestRedis;

    beforeAll(() => {
        if (!containerEngineAvailable() && !process.env.NODE_TEST_REDIS_URL)
            throw new Error(
                'The replicas suite needs a Redis. Start one and set NODE_TEST_REDIS_URL, or make ' +
                    'a container engine available (CONTAINER_ENGINE, default podman). It refuses to ' +
                    'skip: a shared budget nobody checked is what it exists for.'
            );
        return startRedis().then((started) => {
            redis = started;
        });
    });

    afterAll(() => redis.stop());

    it('spends one rate-limit budget across every copy', () => {
        const limit = 5;
        const burst = 30;
        return withReplicas(
            {
                count: COPIES,
                env: {
                    NODE_RATE_LIMIT_REDIS_URL: redis.url,
                    NODE_RATE_LIMIT_REDIS_PREFIX: keyPrefix(),
                    NODE_RATE_LIMIT_MAX: String(limit),
                    NODE_RATE_LIMIT_WINDOW_MS: '60000'
                }
            },
            (replicas) =>
                Promise.all(
                    Array.from({ length: burst }, () =>
                        call(`http://127.0.0.1:${String(replicas.proxy.port)}`, '/').then(
                            (answer) => answer.status
                        )
                    )
                ).then((statuses) => {
                    expect(statuses.filter((status) => status === 200)).toHaveLength(limit);
                    expect(statuses.filter((status) => status === 429)).toHaveLength(burst - limit);
                    // The control: one copy doing all the work also spends exactly one budget.
                    expect(replicas.proxy.servedBy().size).toBeGreaterThanOrEqual(2);
                })
        );
    });

    it('lets a session started on one copy be used, refreshed and ended on the others', () =>
        withReplicas({ count: COPIES }, (replicas) => {
            const proxy = `http://127.0.0.1:${String(replicas.proxy.port)}`;
            return signUpAndLogIn(proxy, 'session-user').then(async ({ bearer, cookie }) => {
                // Login happened wherever the proxy sent it; use the token on every copy directly.
                for (const index of replicas.copies.keys()) {
                    const answer = await call(replicas.direct(index), '/account', {
                        headers: jsonHeaders(bearer)
                    });
                    expect(answer.status).toBe(200);
                }
                // Refresh on copy 1, log out on copy 2: the old token must die on copy 0.
                const refreshed = await call(replicas.direct(1), '/account/refresh', {
                    method: 'POST',
                    headers: { cookie }
                });
                expect(refreshed.status).toBe(200);
                // The token copy 1 minted must be accepted by copy 0, which never saw the refresh.
                // Narrowing: the refresh contract answers `{ token }` on success.
                const { token: refreshedToken } = refreshed.body as { token: string };
                const onOtherCopy = await call(replicas.direct(0), '/account', {
                    headers: jsonHeaders(refreshedToken)
                });
                expect(onOtherCopy.status).toBe(200);
                const loggedOut = await call(replicas.direct(2), '/account/logout', {
                    method: 'POST',
                    headers: { cookie }
                });
                expect(loggedOut.status).toBe(204);
                const afterwards = await call(replicas.direct(0), '/account', {
                    headers: jsonHeaders(bearer)
                });
                expect(afterwards.status).toBe(401);
            });
        }));

    it('runs one write once when the same Idempotency-Key reaches two copies at once', () =>
        withReplicas({ count: COPIES }, (replicas) => {
            const proxy = `http://127.0.0.1:${String(replicas.proxy.port)}`;
            return signUpAndLogIn(proxy, 'idempotent-user').then(async ({ bearer }) => {
                const send = (index: number) =>
                    call(replicas.direct(index), '/account/addresses', {
                        method: 'POST',
                        headers: {
                            ...jsonHeaders(bearer),
                            'idempotency-key': 'same-key-on-two-copies'
                        },
                        body: JSON.stringify(ADDRESS)
                    });
                const [first, second] = await Promise.all([send(0), send(1)]);

                // One ran (201, not a replay); the other either replayed it or was told it is in flight.
                const executed = [first, second].filter(
                    (answer) => answer.status === 201 && !answer.replayed
                );
                expect(executed).toHaveLength(1);
                const other = executed[0] === first ? second : first;
                expect(other.replayed || other.status === 409).toBe(true);

                // The side effect: one address, not two.
                const book = await call(replicas.direct(2), '/account/addresses', {
                    headers: jsonHeaders(bearer)
                });
                // Narrowing: the contract's list answer carries `addresses`.
                const { addresses } = book.body as { addresses: unknown[] };
                expect(addresses).toHaveLength(1);
            });
        }));
});
