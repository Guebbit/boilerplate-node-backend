/**
 * One budget means one budget — across workers, not per worker.
 *
 * `src/cluster.ts` forks a worker per CPU in production. `express-rate-limit`'s default store is an
 * in-process `Map`, so with that store a budget of 100 per minute is really `100 × workers` per
 * minute, and which bucket a request lands in depends on which worker the OS handed the socket to.
 * On a sixteen-core box that is a sixteenfold allowance for password guessing, with nothing in the
 * configuration to say so. Moving the counters to Redis is what makes the number in `.env` the
 * number that is enforced.
 *
 * Nothing could observe that. Every other suite here runs the app in one process, and a
 * per-process counter is indistinguishable from a shared one when there is only one process — so
 * the fix shipped unverified, and a regression to the in-memory store would pass every test in the
 * repository.
 *
 * ── What the second case is for ───────────────────────────────────────────────────────────────
 * A single case asserting "the budget is spent once" is not enough, because it passes just as well
 * when the harness is broken: if only one worker ever serves, or if the burst is carried over one
 * reused socket, a per-process counter also spends exactly one budget. The memory-store case is
 * the control. It runs the identical scenario with Redis switched off and asserts the allowance
 * DOUBLES — which can only happen if two separate processes really are each counting, which is
 * exactly the property the first case needs to be meaningful.
 *
 * Two clusters, ~20 seconds each. That is why this suite is not in `npm run complete`; see
 * `docs/tools/cluster-testing.md`.
 *
 * ── What this found ───────────────────────────────────────────────────────────────────────────
 * On its first run, nothing was being limited at all: 30 of 30 requests answered 200 against a
 * budget of 5. `RedisStore.init()` issues two script loads back to back, both saw `isReady` false,
 * and each called `connect()` on the same client; node-redis rejected the second with `Socket
 * already opened`, and the failure path destroyed the client the first was still using. Every
 * request then passed unbudgeted while the log reported Redis unreachable. The shared `connecting`
 * promise in `rate-limit-store.ts` is the fix, and these cases are what keep it fixed.
 */

import { getOnFreshConnection, startCluster, tally, type Cluster } from './support/cluster';
import { containerEngineAvailable, startRedis, type TestRedis } from './support/redis';

/** Small enough that a burst passes it quickly, large enough that an off-by-one is not the story. */
const LIMIT = 5;
const WORKERS = 2;
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
        /*
         * The assertion the fix needs. `LIMIT` requests are answered and every one after them is
         * refused — no matter which of the two workers each landed on.
         */
        let cluster: Cluster;

        return startCluster({
            workers: WORKERS,
            env: {
                NODE_RATE_LIMIT_REDIS_ENABLED: '1',
                NODE_RATE_LIMIT_REDIS_URL: redis.url,
                NODE_RATE_LIMIT_REDIS_PREFIX: keyPrefix(),
                NODE_RATE_LIMIT_MAX: String(LIMIT),
                NODE_RATE_LIMIT_WINDOW_MS: '60000'
            }
        })
            .then((started) => {
                cluster = started;
                return burstAgainst(cluster);
            })
            .then((counts) => {
                expect(counts[200]).toBe(LIMIT);
                expect(counts[429]).toBe(BURST - LIMIT);
            })
            .finally(() => cluster.stop());
    });

    it('gives each worker its own budget when the counters are in memory', () => {
        /*
         * The control, and the reason the case above means anything.
         *
         * This is the BUG, reproduced deliberately: with per-process counters two workers grant two
         * budgets. Asserting the exact double rather than "more than LIMIT" is what also proves the
         * burst reached both workers — anything less and the first case would be passing because
         * only one worker ever served.
         *
         * `NODE_REDIS_URL` is blanked as well: the limiter falls back to the cache's URL when it
         * has none of its own, so leaving it set would quietly put these counters back in Redis and
         * turn this case into a duplicate of the one above.
         */
        let cluster: Cluster;

        return startCluster({
            workers: WORKERS,
            env: {
                NODE_RATE_LIMIT_REDIS_ENABLED: '0',
                NODE_RATE_LIMIT_REDIS_URL: '',
                NODE_REDIS_URL: '',
                NODE_RATE_LIMIT_MAX: String(LIMIT),
                NODE_RATE_LIMIT_WINDOW_MS: '60000'
            }
        })
            .then((started) => {
                cluster = started;
                return burstAgainst(cluster);
            })
            .then((counts) => {
                expect(counts[200]).toBe(LIMIT * WORKERS);
                expect(counts[429]).toBe(BURST - LIMIT * WORKERS);
            })
            .finally(() => cluster.stop());
    });
});
