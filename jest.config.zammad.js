/**
 * The Zammad adapter contract suite's own runner: `npm run test:zammad`.
 *
 * Same reasoning as `jest.config.broker.js`: the defaults in `jest.config.js` are wrong here.
 *
 *   `setupFiles`  only `tests/support/setup-environment.ts`: plain `??=` env defaults, no imports,
 *                 so it boots nothing. NOT `tests/support/setup.ts`, which boots i18n and raises
 *                 budgets the adapter never touches.
 *   no database   the adapter talks HTTP and keeps nothing: no `globalSetup`, no mongod.
 *   `testTimeout` 60s: a real Zammad's first ticket create can take seconds.
 *
 * Needs a booted Zammad and `NODE_TEST_ZAMMAD_URL`, `NODE_TEST_ZAMMAD_TOKEN` (the integration user's
 * token) and `NODE_TEST_ZAMMAD_ADMIN_TOKEN` (an Admin's, for the field setup): see
 * `src/modules/zammad/tests/real-zammad/adapter.contract.test.ts`. An unset variable FAILS the suite,
 * never skips it: a skipped contract suite reads as a green one.
 *
 * `jest.config.js` ignores `real-zammad`, so `npm test` stays free of a container.
 */

const base = require('./jest.config.js');

module.exports = {
    preset: base.preset,
    moduleNameMapper: base.moduleNameMapper,
    transform: base.transform,
    transformIgnorePatterns: base.transformIgnorePatterns,
    cacheDirectory: base.cacheDirectory,
    testEnvironment: base.testEnvironment,
    setupFiles: ['<rootDir>/tests/support/setup-environment.ts'],
    roots: ['<rootDir>/src/modules/zammad/tests/real-zammad'],
    testMatch: ['**/tests/real-zammad/**/*.test.ts'],
    // One at a time: the cases share one Zammad and its ticket numbers.
    maxWorkers: 1,
    testTimeout: 60_000
};
