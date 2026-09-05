/*
 * Jest configuration for the unit run, and the base the other jest configs extend. A .js file
 * rather than .json so the coverage floors can carry their explanation — JSON holds no comment, and
 * Jest warns on any key it does not recognise. Those floors are a ratchet and a fast proxy for the
 * mutation run, which is the real instrument: docs/tools/coverage-and-confidence.md.
 */

const os = require('node:os');
const path = require('node:path');
const { existsSync, readFileSync } = require('node:fs');
const { parseEnv } = require('node:util');

/**
 * Reads `.env` without merging it into the environment.
 *
 * `parseEnv` rather than `process.loadEnvFile()`: the latter merges into `process.env`, and jest
 * hands its environment to every worker — the real rate limits then land before
 * `tests/support/setup.ts` can raise them, and the concurrency suites answer 429 to their own
 * fixtures.
 *
 * @returns the file's variables, or `{}` when there is no `.env` — the normal case in CI
 */
const readEnvFile = () => {
    const envFile = path.join(__dirname, '.env');
    // Checked rather than caught: a checkout without a `.env` is ordinary, not exceptional.
    return existsSync(envFile) ? parseEnv(readFileSync(envFile, 'utf8')) : {};
};

/**
 * How many jest workers to run.
 *
 * Jest's own default (`logical CPUs - 1`) counts cores for a workload bounded by memory, and the
 * OOM killer then takes workers mid-run while every test still passes. The safe number is a
 * property of the machine, so it lives in `.env` — measurements in
 * docs/tools/mutation-testing.md#jest-worker-count.
 *
 * @returns `JEST_WORKERS` when set, otherwise `logical CPUs - 2`
 */
const resolveMaxWorkers = () => {
    // A real environment variable wins over the file, so a one-off run can go lower without
    // editing anything: `JEST_WORKERS=2 npm run test:unit`.
    const setting = process.env.JEST_WORKERS ?? readEnvFile().JEST_WORKERS;
    const configured = Number(setting?.trim());
    if (Number.isInteger(configured) && configured > 0) return configured;

    // At least one, or a single-core container would compute zero workers and run nothing.
    return Math.max(1, os.cpus().length - 2);
};

/**
 * One entry in `coverageThreshold`, as Jest wants it.
 *
 * `lines` defaults to `statements` because `coverageProvider: 'v8'` derives both from the same
 * range data — every floor below measured identical on both. It stays an overridable parameter
 * rather than a hard-coded copy, since another provider would let the two diverge.
 *
 * @param statements minimum percentage of statements covered
 * @param branches minimum percentage of branches covered
 * @param functions minimum percentage of functions covered
 * @param lines minimum percentage of lines covered; defaults to `statements`
 * @returns the minima for one threshold key
 */
const floor = (statements, branches, functions, lines = statements) => ({
    statements,
    branches,
    functions,
    lines
});

/**
 * What a file with its own unit suite is expected to clear. Raising this raises four keys at once,
 * which is the point of it being one value.
 */
const STANDARD = floor(70, 70, 70);

/**
 * Covered by `tests/integration` and `tests/contract`, which this run does not include — so the
 * unit layer only grazes it. `functions: 0` is the honest reading where the unit suite calls none
 * of a file's exports; branches stay floored because the unit suite does reach the guard clauses.
 */
const PARTIAL = floor(25, 70, 0);

/**
 * No suite drives this file at all — the honest zero on the record, for the ratchet to raise.
 */
const UNTESTED = floor(0, 0, 0);

module.exports = {
    preset: 'ts-jest',
    clearMocks: true,
    coverageProvider: 'v8',
    testEnvironment: 'node',
    maxWorkers: resolveMaxWorkers(),
    testMatch: ['**/tests/**/*.test.ts'],
    /*
     * `tests/cluster` runs under `jest.config.cluster.js` instead: those tests spawn `src/cluster.ts`
     * as a child process and boot their own Mongo and Redis, so none of this file's setup applies.
     */
    testPathIgnorePatterns: [
        '/node_modules/',
        '<rootDir>/.stryker-tmp/',
        '<rootDir>/.tmp/',
        '<rootDir>/tests/cluster/'
    ],
    modulePathIgnorePatterns: ['<rootDir>/.stryker-tmp/', '<rootDir>/.tmp/'],
    collectCoverageFrom: [
        'src/**/*.ts',
        '!src/types/**',
        '!src/**/*.d.ts',
        // Co-located specs are test code, not covered code. Without this a module's own tests count
        // towards its coverage and every floor below becomes self-satisfying.
        '!src/**/tests/**'
    ],
    /*
     * PER-FILE floors, and the glob shape is the whole point: a key naming a directory pools every
     * file beneath it into one total, where a glob is applied to each file separately. A key
     * matching no file is silently ignored. An exemption is an extglob negation PLUS the file's own
     * key — both halves, or the strict check still runs against it. Controllers are deliberately
     * unfloored. A bare number here is a measured value; `STANDARD` and `UNTESTED` are the two
     * shared ones. See docs/tools/coverage-and-confidence.md#how-the-floors-are-written.
     */
    coverageThreshold: {
        // Branches and functions sit at 50: a schema file's validators and virtuals are driven
        // through the model, which is integration territory.
        'src/modules/*/model.ts': floor(70, 50, 50),
        'src/modules/*/repository.ts': PARTIAL,
        'src/modules/*/service.ts': PARTIAL,
        'src/modules/*/services/*.ts': PARTIAL,
        /*
         * Pure functions over plain data — the cheapest code in the repo to execute, so this floor
         * is a real bar rather than a record. `!(index)` excludes the barrel, whose `functions`
         * metric counts re-export arrows and so measures wiring rather than testing.
         */
        'src/modules/*/domain/!(index).ts': floor(100, 69, 100),
        // `registry.ts` is the low file on functions at 66.66.
        'src/kernel/**/!(seed-accounts).ts': floor(70, 70, 66),
        // Two branches, neither reached by a unit test. Negated out of the key above rather than
        // dropping that key's branch floor to 0 for the five files that do clear it.
        'src/kernel/seed-accounts.ts': floor(100, 0, 100),
        /*
         * Every subdirectory of `src/infrastructure/` carries its own key: one that falls out of
         * this list stops being measured rather than failing.
         * `tests/cross-cutting/coverage-thresholds.test.ts` is what turns that red instead.
         */
        'src/infrastructure/i18n/**/*.ts': STANDARD,
        // `create-repository.ts` and `seed.ts` both sit at 33.33 functions — the factories are
        // driven through the repositories they build, which the unit run does not exercise.
        'src/infrastructure/persistence/*.ts': floor(70, 70, 33),
        // `otel-sdk.ts` is negated out because its behaviour belongs to the OpenTelemetry runtime
        // rather than to this codebase; the other two carry their own entries below.
        'src/infrastructure/runtime/!(otel-sdk|database|server-lifecycle).ts': STANDARD,
        // Connect-retry and `stopDatabase` are driven by boot and shutdown, which no unit owns.
        'src/infrastructure/runtime/database.ts': floor(70, 100, 25),
        'src/infrastructure/runtime/server-lifecycle.ts': UNTESTED,
        // The measured minimum across the folder: `validation-messages.ts` on statements and
        // lines, `rate-limit.ts` on branches, `controller.ts` on functions.
        'src/infrastructure/http/**/*.ts': floor(86, 42, 50),
        'src/infrastructure/adapters/*.ts': STANDARD,
        /*
         * The four route-surface controller factories. Unlike a per-module `controllers/` file
         * these are shared infrastructure with real unit coverage of their own, exercised
         * transitively through the ten controllers built on them, so a floor is worth keeping.
         */
        'src/infrastructure/surfaces/*.ts': floor(62, 100, 50),
        'src/infrastructure/observability/*.ts': STANDARD,
        // The analytics providers need their own key: the glob above ends in `.ts` and so matches
        // only files sitting directly in `observability/`, not this subdirectory. Each provider
        // leaves one exported hook undriven, which is the 66.
        'src/infrastructure/observability/analytics/**/*.ts': floor(70, 70, 66)
    },
    globalSetup: '<rootDir>/tests/support/global-setup.ts',
    globalTeardown: '<rootDir>/tests/support/global-teardown.ts',
    setupFiles: ['<rootDir>/tests/support/setup.ts'],
    testTimeout: 30_000,
    transform: {
        '^.+\\.tsx?$': [
            'ts-jest',
            {
                tsconfig: 'tsconfig.jest.json',
                /*
                 * Silences ts-jest's `ModernNodeModule` warning (151002), which `module: node16`
                 * triggers to ask for `isolatedModules` — a setting that would break dynamic
                 * import under jest's CJS runtime. The reasoning is in `tsconfig.jest.json`.
                 * https://kulshekhar.github.io/ts-jest/docs/getting-started/options/diagnostics
                 */
                diagnostics: {
                    ignoreCodes: [151_002]
                }
            }
        ],
        /*
         * `otplib`'s own packages ship a working CJS build, but two of their transitive deps —
         * `@scure/base`, `@noble/hashes` — do not. Jest's module runtime predates Node 22's
         * synchronous `require(esm)` and still trips on their `export` syntax; downlevelling just
         * the module syntax, only for these two scopes, is narrower than adopting a Babel preset
         * in a codebase that otherwise has none.
         */
        '^.+\\.jsx?$': ['babel-jest', { plugins: ['@babel/plugin-transform-modules-commonjs'] }]
    },
    /*
     * Default is "ignore everything under node_modules", carved open only for `@scure`/`@noble`.
     * Not anchored to "right after node_modules": `@noble/hashes` sometimes lands nested in its own
     * unhoisted copy, so the check is "does either scope appear anywhere past this point".
     */
    transformIgnorePatterns: ['node_modules/(?!.*@(?:scure|noble))'],
    moduleNameMapper: {
        '^@api/(.*)$': '<rootDir>/api/$1',
        '^@types$': '<rootDir>/src/types',
        '^@tests/(.*)$': '<rootDir>/tests/support/$1',
        '^@app/(.*)$': '<rootDir>/src/app/$1',

        '^@infrastructure/(.*)$': '<rootDir>/src/infrastructure/$1',
        '^@kernel/(.*)$': '<rootDir>/src/kernel/$1',
        '^@modules/(.*)$': '<rootDir>/src/modules/$1'
    }
};
