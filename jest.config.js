/*
 * Jest configuration for the unit run, and the base the other jest configs extend. A .js file
 * rather than .json so its settings can carry their explanation — JSON holds no comment, and
 * Jest warns on any key it does not recognise. Coverage is not measured; the mutation score is the
 * test-quality number: docs/tools/coverage-and-confidence.md.
 */

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
 * `.env`'s contents, read once.
 *
 * Memoised because every knob below consults it, and re-reading the file per lookup would make
 * this config's cost grow with the number of knobs rather than stay flat.
 */
const envFileValues = readEnvFile();

/**
 * The DEPTH knobs, promoted from `.env` into `process.env` for the suites that read them.
 *
 * An allowlist, never a merge — merging `.env` wholesale is precisely what {@link readEnvFile}
 * exists to avoid. Read by the harness alone (`tests/support/knobs.ts`), so turning one down
 * changes what a suite ASKS, never what the code under test answers.
 *
 * Promoted here rather than in `globalSetup` because `process.env` is the only channel that
 * crosses into a jest WORKER, and `jest.config.cluster.js` runs no `globalSetup` at all while
 * still extending this file.
 */
const DEPTH_KNOBS = [
    'TEST_FUZZ_RUNS',
    'TEST_PROPERTY_RUNS',
    'TEST_PROPERTY_RUNS_DB',
    'TEST_RACE_SIZE'
];

for (const name of DEPTH_KNOBS) {
    if (envFileValues[name] !== undefined) process.env[name] ??= envFileValues[name];
}

/**
 * How many jest workers a bare `npx jest` may run, when nothing else has decided for it.
 *
 * The sizing that matters lives in `scripts/testing/machine-budget.ts`, reached through
 * `scripts/testing/run-suite.ts` for every npm script — it reads MemAvailable and passes
 * `--maxWorkers`, `--workerIdleMemoryLimit` and a pinned `--max-old-space-size` on the command
 * line, where they beat anything written here. This file is CommonJS and cannot import that ESM
 * module, so it does not reimplement the arithmetic either — a fixed, deliberately small number
 * for `npx jest --onlyChanged`, an IDE's gutter button, or a single file run directly. Guessing low
 * costs a slower ad-hoc run; guessing high risks the OOM killer taking a worker mid-file.
 *
 * `JEST_WORKERS` in `.env` still wins. See docs/tools/weak-machines.md.
 */
const DEFAULT_MAX_WORKERS = 2;

/**
 * Per-worker memory ceiling for that same fallback, in MB.
 *
 * Above a worker's steady-state baseline on purpose. Set below it, jest finds every worker over
 * budget the moment it goes idle and restarts it after each test file — measured, and slower than
 * the retention it is meant to contain.
 */
const DEFAULT_WORKER_MEMORY_MB = 1400;

/**
 * Resolves one of the two numbers above from the environment.
 *
 * @param name the variable to read, from the real environment first and then `.env`
 * @param fallback the value to use when it is unset, empty or nonsense
 * @returns a positive integer
 */
const fromEnvironment = (name, fallback) => {
    // A real environment variable wins over the file, so a one-off run can go lower without
    // editing anything: `JEST_WORKERS=1 npx jest`.
    const setting = process.env[name] ?? envFileValues[name];
    const configured = Number(setting?.trim());
    return Number.isInteger(configured) && configured > 0 ? configured : fallback;
};

module.exports = {
    preset: 'ts-jest',
    clearMocks: true,
    // `node`, plus clearing every timer a file leaves running — without it each file's whole module
    // graph stays alive, which a single-process run (Stryker's dry run) cannot survive.
    testEnvironment: '<rootDir>/tests/support/test-environment.ts',
    maxWorkers: fromEnvironment('JEST_WORKERS', DEFAULT_MAX_WORKERS),
    workerIdleMemoryLimit: `${fromEnvironment('JEST_WORKER_MEMORY_MB', DEFAULT_WORKER_MEMORY_MB)}MB`,
    testMatch: ['**/tests/**/*.test.ts'],
    /*
     * `tests/cluster` runs under `jest.config.cluster.js` instead: those tests spawn `src/cluster.ts`
     * as a child process and boot their own Mongo and Redis, so none of this file's setup applies.
     * `tests/broker` runs under `jest.config.broker.js`: it needs a real RabbitMQ and no database.
     */
    testPathIgnorePatterns: [
        '/node_modules/',
        '<rootDir>/tmp/',
        '<rootDir>/.claude/worktrees/',
        '<rootDir>/tests/cluster/',
        '<rootDir>/tests/broker/'
    ],
    modulePathIgnorePatterns: ['<rootDir>/tmp/', '<rootDir>/.claude/worktrees/'],
    globalSetup: '<rootDir>/tests/support/global-setup.ts',
    globalTeardown: '<rootDir>/tests/support/global-teardown.ts',
    setupFiles: ['<rootDir>/tests/support/setup.ts'],
    // Redirects every file the code under test writes into a per-test-file sandbox.
    setupFilesAfterEnv: [
        '<rootDir>/tests/support/setup-file-sandbox.ts',
        // After the sandbox, which it marks: every case then starts from that environment.
        '<rootDir>/tests/support/setup-environment-reset.ts'
    ],
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
     * Default is "ignore everything under node_modules", carved open for `@scure`/`@noble` and for
     * the ESM-only OAuth/JWT stack (`jose`, `openid-client` and its `oauth4webapi`).
     * Not anchored to "right after node_modules": `@noble/hashes` sometimes lands nested in its own
     * unhoisted copy, so the check is "does either scope appear anywhere past this point".
     */
    transformIgnorePatterns: [
        'node_modules/(?!.*(?:@(?:scure|noble)|(?:jose|oauth4webapi|openid-client)/))'
    ],
    moduleNameMapper: {
        '^@api/(.*)$': '<rootDir>/api/$1',
        '^@types$': '<rootDir>/src/types',
        '^@tests/(.*)$': '<rootDir>/tests/support/$1',
        '^@app/(.*)$': '<rootDir>/src/app/$1',

        '^@infrastructure/(.*)$': '<rootDir>/src/infrastructure/$1',
        '^@kernel/(.*)$': '<rootDir>/src/kernel/$1',
        '^@modules/(.*)$': '<rootDir>/src/modules/$1',
        '^@shared-kernel/(.*)$': '<rootDir>/src/shared-kernel/$1',
        '^@scenarios/(.*)$': '<rootDir>/scenarios/$1',

        /*
         * The one third-party module replaced wholesale: `puppeteer-core` v25 is ESM-only and
         * cannot be parsed here. See the stub for why nothing wanted the real package anyway.
         */
        '^puppeteer-core$': '<rootDir>/tests/support/puppeteer-core.stub.ts'
    }
};
