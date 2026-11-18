/**
 * The replicas suite's own runner — `npm run test:replicas`.
 *
 * A separate config rather than another directory under the main one, because every default in
 * `jest.config.js` is wrong here and each for a stated reason:
 *
 *   `setupFiles`     `tests/support/setup.ts` blanks `NODE_RATE_LIMIT_REDIS_URL` and raises
 *                    the budgets, which is right for every in-process suite and is precisely what
 *                    this one is measuring. It also would not reach the child anyway — these tests
 *                    hand a whole environment to a process they spawn.
 *   `globalSetup`    starts one shared in-memory mongod for the run. These tests boot their own,
 *                    because their workers connect over TCP from another process and cannot be
 *                    handed this one's mongoose connection.
 *   `testTimeout`    30s. Booting several copies and pulling a Redis image is longer than that; the
 *                    files set their own.
 *
 * `jest.config.js` ignores `tests/replicas` for the mirror image of these reasons, so `npm test`
 * stays in one process and stays fast.
 */

const base = require('./jest.config.js');

module.exports = {
    preset: base.preset,
    moduleNameMapper: base.moduleNameMapper,
    transform: base.transform,
    // Same on-disk cache as the base config, see its comment.
    cacheDirectory: base.cacheDirectory,
    testEnvironment: base.testEnvironment,
    roots: ['<rootDir>/tests/replicas'],
    testMatch: ['**/tests/replicas/**/*.test.ts'],
    /**
     * One at a time. Each case boots several real copies on real ports and fires a burst at them;
     * two of those in parallel are two bursts competing for the same CPUs, and a rate-limit
     * assertion measured under that is a coin toss.
     */
    maxWorkers: 1,
    testTimeout: 240_000
};
