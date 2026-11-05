/*
 * Jest config used only by Stryker (`npm run mutation`, `npm run mutation:full`): `jest.config.js`
 * with the worker pool collapsed to one and an absolute test environment path. The swc transform
 * is inherited from the base config, so mutation runs and ordinary runs compile alike.
 * See docs/tools/mutation-testing.md.
 */
const path = require('node:path');
const baseConfig = require('./jest.config');

module.exports = {
    ...baseConfig,
    /*
     * `jest.config.js`'s own `<rootDir>/tests/support/test-environment.ts` never resolves under
     * Stryker: its jest-runner reads config with jest-config's lightweight `readInitialOptions`
     * (not the full `normalize()` that expands the token), so `<rootDir>` reaches
     * `require.resolve` as a literal, unresolvable path segment. An absolute path sidesteps that
     * loader entirely, since there is nothing left to substitute.
     * https://github.com/stryker-mutator/stryker-js — jest-runner's `overrideEnvironment` reads
     * `jestConfig.testEnvironment` straight off the raw, unnormalized config.
     */
    testEnvironment: path.join(__dirname, 'tests/support/test-environment.ts'),
    /*
     * One worker, because Stryker is already the pool: it runs `concurrency` full jests at once,
     * so the base config's `CPUs - 2` is multiplied rather than reused. `STRYKER_CONCURRENCY` in
     * `.env` is the one knob. See docs/tools/mutation-testing.md#the-worker-pool-multiplication.
     */
    maxWorkers: 1,
    // Dropped with the pool: the base config only sets it for more than one worker, and a limit
    // left on a one-worker run stops jest running in band.
    workerIdleMemoryLimit: undefined,
    /*
     * Four times the base config's 30 s. Instrumented code under per-test coverage runs slower, and
     * one timed-out test in Stryker's initial run fails the whole shard — measured 2026-10-07, the
     * generated-basket property in `checkout-money-reconciliation.test.ts`. A mutant that hangs is
     * still caught: Stryker's own `timeoutMS` stops it, independently of this.
     * https://stryker-mutator.io/docs/stryker-js/configuration/#timeoutms-number
     */
    testTimeout: 120_000
};
