/*
 * The cluster suite's own runner — `npm run test:cluster`.
 *
 * A separate config rather than another directory under the main one, because every default in
 * `jest.config.js` is wrong here and each for a stated reason:
 *
 *   `setupFiles`     `tests/support/setup.ts` sets `NODE_RATE_LIMIT_REDIS_ENABLED=0` and raises
 *                    the budgets, which is right for every in-process suite and is precisely what
 *                    this one is measuring. It also would not reach the child anyway — these tests
 *                    hand a whole environment to a process they spawn.
 *   `globalSetup`    starts one shared in-memory mongod for the run. These tests boot their own,
 *                    because their workers connect over TCP from another process and cannot be
 *                    handed this one's mongoose connection.
 *   `testTimeout`    30s. Booting a cluster and pulling a Redis image is longer than that; the
 *                    files set their own.
 *   `coverage`       meaningless. The code under test runs in a child process, so nothing here is
 *                    instrumented — a floor would only ever measure the harness.
 *
 * `jest.config.js` ignores `tests/cluster` for the mirror image of these reasons, so `npm test`
 * and `test:all` stay in one process and stay fast.
 */

const base = require('./jest.config.js');

module.exports = {
    preset: base.preset,
    moduleNameMapper: base.moduleNameMapper,
    transform: base.transform,
    testEnvironment: base.testEnvironment,
    roots: ['<rootDir>/tests/cluster'],
    testMatch: ['**/tests/cluster/**/*.test.ts'],
    /*
     * One at a time. Each case boots a cluster of real workers on a real port and fires a burst at
     * it; two of those in parallel are two bursts competing for the same CPUs, and a rate-limit
     * assertion measured under that is a coin toss.
     */
    maxWorkers: 1,
    testTimeout: 240_000
};
