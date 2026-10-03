/*
 * The broker suite's own runner — `npm run test:broker`.
 *
 * Same reasoning as `jest.config.cluster.js`, for the same reasons: the defaults in
 * `jest.config.js` are wrong here.
 *
 *   `setupFiles`     `tests/support/setup.ts` raises rate-limit budgets and boots i18n, none of which
 *                    the queue adapter touches. It also would not help: these tests build the
 *                    adapter's environment themselves, per case.
 *   `globalSetup`    starts a shared in-memory mongod. Nothing here reads a database.
 *   `testTimeout`    30s. Pulling a RabbitMQ image and waiting out a retry TTL is longer; the files
 *                    set their own.
 *   `coverage`       meaningless. `queue.ts` is covered by its unit suite; this one measures what a
 *                    real broker does with the arguments that suite only asserts we pass.
 *
 * `jest.config.js` ignores `tests/broker` so `npm test` stays free of a container.
 */

const base = require('./jest.config.js');

module.exports = {
    preset: base.preset,
    moduleNameMapper: base.moduleNameMapper,
    transform: base.transform,
    testEnvironment: base.testEnvironment,
    roots: ['<rootDir>/tests/broker'],
    testMatch: ['**/tests/broker/**/*.test.ts'],
    /*
     * One at a time. The cases share one broker and wait on real TTLs; two files racing for it
     * would only make the timings flakier.
     */
    maxWorkers: 1,
    testTimeout: 120_000
};
