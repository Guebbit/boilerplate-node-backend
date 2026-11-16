/**
 * The broker suite's own runner — `npm run test:broker`.
 *
 * Same reasoning as `jest.config.cluster.js`, for the same reasons: the defaults in
 * `jest.config.js` are wrong here.
 *
 *   `setupFiles`     only `tests/support/setup-environment.ts`: plain `??=` env defaults, no imports,
 *                    so it boots nothing. It supplies the secrets the adapter's import chain demands
 *                    (`NODE_PSEUDONYM_KEY`, which has no built-in value). NOT `tests/support/setup.ts`,
 *                    which boots i18n and raises budgets the queue adapter never touches; the cases
 *                    still build the adapter's own environment per case.
 *   `globalSetup`    starts a shared in-memory mongod. Nothing here reads a database.
 *   `testTimeout`    30s. Pulling a RabbitMQ image and waiting out a retry TTL is longer; the files
 *                    set their own.
 *
 * `jest.config.js` ignores `tests/broker` so `npm test` stays free of a container.
 */

const base = require('./jest.config.js');

module.exports = {
    preset: base.preset,
    moduleNameMapper: base.moduleNameMapper,
    transform: base.transform,
    // Same on-disk cache as the base config, see its comment.
    cacheDirectory: base.cacheDirectory,
    testEnvironment: base.testEnvironment,
    setupFiles: ['<rootDir>/tests/support/setup-environment.ts'],
    roots: ['<rootDir>/tests/broker'],
    testMatch: ['**/tests/broker/**/*.test.ts'],
    /**
     * One at a time. The cases share one broker and wait on real TTLs; two files racing for it
     * would only make the timings flakier.
     */
    maxWorkers: 1,
    testTimeout: 120_000
};
