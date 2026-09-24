/*
 * Jest config used only by Stryker (`npm run mutation`, `npm run mutation:full`): `jest.config.js`
 * with ts-jest
 * swapped for swc and the worker pool collapsed to one. ts-jest type-checks, and its
 * LanguageService cache grows with every mutant until the worker is OOM-killed; swc only
 * transpiles, so it retains nothing, and `npm run ts-check` already checks the types once.
 * See docs/tools/mutation-testing.md.
 */
const path = require('node:path');
const baseConfig = require('./jest.config');

module.exports = {
    ...baseConfig,
    // The ts-jest preset is what installs the transform this file exists to replace.
    preset: undefined,
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
    transform: {
        // Spread first: only the TypeScript matcher is replaced, so the base config's `.js` entry
        // (babel-jest, for the ESM-only `@scure`/`@noble`) survives.
        ...baseConfig.transform,
        /*
         * @swc/jest: transpile-only TypeScript, no type-check.
         * `target` matches the app's compile target — swc emits for the runtime, not a browser
         * matrix — and `module: commonjs` downlevels `import()` for Jest's CJS runtime.
         * https://swc.rs/docs/configuration/compilation
         */
        '^.+\\.tsx?$': [
            '@swc/jest',
            {
                jsc: {
                    parser: { syntax: 'typescript' },
                    target: 'es2022'
                },
                module: { type: 'commonjs' }
            }
        ]
    }
};
