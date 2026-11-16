/**
 * One budget means one budget: across workers, not per worker.
 *
 * Why:        `src/cluster.ts` forks a worker per CPU, and orchestrator replicas run several
 *             processes too. `express-rate-limit`'s default store is an in-process `Map`, so a
 *             budget of 100 per minute is `100 × workers`. Redis counters make the number in
 *             `.env` the number enforced; the primary refuses 2+ workers without it.
 * Gap:        every other suite runs one process, where a per-process counter looks shared, so a
 *             regression to the in-memory store would pass the whole repository.
 * Case 1:     "the budget is spent once". It also passes with a broken harness (one worker serving,
 *             one reused socket) or with Redis down (`rate-limit.ts` falls back to memory). The
 *             control: each worker logs its `pid` per answer, and the case asserts at least two
 *             workers answered and their counts sum to the burst.
 * Case 2:     the refusal. 2 workers without a limits Redis never boot, so there is no second
 *             budget to observe.
 * Cost:       two boots, ~20 seconds, hence not in `npm run complete`.
 * Guards:     `RedisStore.init()` loads two scripts back to back; the shared `connecting` promise
 *             in `rate-limit-store.ts` stops both calling `connect()` on one client, which left
 *             every request unbudgeted while the log said Redis was unreachable.
 *
 * @see docs/build/cluster-testing.md#why-it-is-not-in-complete
 */

import {
    expectRefusal,
    getOnFreshConnection,
    tally,
    withCluster,
    type Cluster
} from './support/cluster';
import { containerEngineAvailable } from '@tests/container-engine';
import { retryUntil } from '@tests/eventually';
import { startRedis, type TestRedis } from './support/redis';

/** Small enough that a burst passes it quickly, large enough that an off-by-one is not the story. */
const LIMIT = 5;
/** Worker processes the cluster under test forks. */
const WORKERS = 2;
/** Requests sent in one burst: well past the limit, so the shared counter must refuse some. */
const BURST = 30;

/** Booting two clusters and pulling a Redis image is not a five-second affair. */
jest.setTimeout(240_000);

/**
 * The counters live under this prefix, unique per run.
 *
 * A shared Redis remembers: the window is a minute, so a second run inside one would start against
 * a budget the first had already spent and read as a failure that has nothing to do with the code.
 */
const keyPrefix = () => `cluster-test-${String(process.pid)}-${String(Date.now())}`;

/** Fire `BURST` requests at once, each on its own connection, and count what came back. */
const burstAgainst = (cluster: Cluster) =>
    Promise.all(Array.from({ length: BURST }, () => getOnFreshConnection(cluster.port))).then(
        tally
    );

/**
 * Wait until the workers' log lines account for the whole burst, then return the per-pid spread.
 * The lines arrive over a pipe, after the responses, so the sum is polled rather than read once.
 */
const servedAcrossWorkers = (cluster: Cluster): Promise<Map<number, number>> =>
    retryUntil(
        () => {
            const perWorker = cluster.servedByPid();
            const total = [...perWorker.values()].reduce((sum, count) => sum + count, 0);
            return total === BURST
                ? Promise.resolve(perWorker)
                : Promise.reject(
                      new Error(`Workers logged ${String(total)} of ${String(BURST)} answers`)
                  );
        },
        10_000,
        100
    );

describe('the rate limiter across a real cluster', () => {
    let redis: TestRedis;

    beforeAll(() => {
        if (!containerEngineAvailable() && !process.env.NODE_TEST_REDIS_URL)
            throw new Error(
                'The cluster suite needs a Redis. Start one and set NODE_TEST_REDIS_URL, or make ' +
                    'a container engine available (CONTAINER_ENGINE, default podman). This suite ' +
                    'refuses to skip: a security control nobody checked is the thing it exists for.'
            );

        return startRedis().then((started) => {
            redis = started;
        });
    });

    afterAll(() => redis.stop());

    it('spends one budget across every worker', () => {
        /**
         * The assertion the fix needs. `LIMIT` requests are answered and every one after them is
         * refused — no matter which of the two workers each landed on.
         */
        return withCluster(
            {
                workers: WORKERS,
                env: {
                    NODE_RATE_LIMIT_REDIS_URL: redis.url,
                    NODE_RATE_LIMIT_REDIS_PREFIX: keyPrefix(),
                    NODE_RATE_LIMIT_MAX: String(LIMIT),
                    NODE_RATE_LIMIT_WINDOW_MS: '60000'
                }
            },
            (cluster) =>
                burstAgainst(cluster)
                    .then((counts) => {
                        expect(counts[200]).toBe(LIMIT);
                        expect(counts[429]).toBe(BURST - LIMIT);
                    })
                    .then(() => servedAcrossWorkers(cluster))
                    .then((perWorker) => {
                        /**
                         * The control. Each limit falls back to in-memory counting when Redis
                         * errors, and one worker alone also spends exactly one budget. Both would
                         * pass the counts above; neither can show more than one worker answering.
                         */
                        expect(perWorker.size).toBeGreaterThanOrEqual(2);
                    })
        );
    });

    it('refuses to boot two workers when the counters would be in memory', () => {
        /**
         * Two workers without the limits Redis would each count alone and grant a doubled budget.
         * The primary refuses before it forks (`assertSharedRateLimitCounters`), so there is no
         * cluster to burst against: the case asserts the refusal and the variable it names.
         *
         * The limits URL is blanked explicitly: a developer's `.env` may carry one, and leaving it
         * would let the primary boot and `expectRefusal` time out instead of failing for the reason
         * under test.
         */
        return expectRefusal({ workers: WORKERS, env: { NODE_RATE_LIMIT_REDIS_URL: '' } }).then(
            ({ exitCode, output }) => {
                expect(exitCode).toBe(1);
                expect(output).toMatch(
                    new RegExp(`Refusing to start ${String(WORKERS)} cluster workers`)
                );
            }
        );
    });
});
