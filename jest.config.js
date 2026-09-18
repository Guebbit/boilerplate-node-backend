/*
 * Jest configuration for the unit run, and the base the other jest configs extend. A .js file
 * rather than .json so the coverage floors can carry their explanation — JSON holds no comment, and
 * Jest warns on any key it does not recognise. Those floors are a ratchet and a fast proxy for the
 * mutation run, which is the real instrument: docs/tools/coverage-and-confidence.md.
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
    maxWorkers: fromEnvironment('JEST_WORKERS', DEFAULT_MAX_WORKERS),
    workerIdleMemoryLimit: `${fromEnvironment('JEST_WORKER_MEMORY_MB', DEFAULT_WORKER_MEMORY_MB)}MB`,
    testMatch: ['**/tests/**/*.test.ts'],
    /*
     * `tests/cluster` runs under `jest.config.cluster.js` instead: those tests spawn `src/cluster.ts`
     * as a child process and boot their own Mongo and Redis, so none of this file's setup applies.
     */
    testPathIgnorePatterns: [
        '/node_modules/',
        '<rootDir>/.stryker-tmp/',
        '<rootDir>/.tmp/',
        '<rootDir>/.claude/worktrees/',
        '<rootDir>/tests/cluster/'
    ],
    modulePathIgnorePatterns: [
        '<rootDir>/.stryker-tmp/',
        '<rootDir>/.tmp/',
        '<rootDir>/.claude/worktrees/'
    ],
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
        'src/modules/!(api-keys|products)/model.ts': floor(70, 50, 50),
        // Every statement runs at import, but the unit suite calls none of the schema's own hooks
        // — `api-keys` is driven entirely through `tests/integration` and its contract suite.
        'src/modules/api-keys/model.ts': floor(100, 100, 0),
        // The richest schema in the repo: nine methods and virtuals, four of which only a real
        // document reaches. The rest of the file is the best-covered model here.
        'src/modules/products/model.ts': floor(89, 69, 44),
        'src/modules/*/repository.ts': PARTIAL,
        'src/modules/*/service.ts': PARTIAL,
        'src/modules/!(webhooks)/services/*.ts': PARTIAL,
        // `catalogue.ts` is a table of event descriptors: every statement runs at import, and the
        // one branch the unit run misses is the filter its consumers pass through.
        'src/modules/webhooks/services/!(catalogue).ts': PARTIAL,
        'src/modules/webhooks/services/catalogue.ts': floor(100, 66, 0),
        /*
         * Pure functions over plain data — the cheapest code in the repo to execute, so this floor
         * is a real bar rather than a record. `!(index)` excludes the barrel, whose `functions`
         * metric counts re-export arrows and so measures wiring rather than testing.
         */
        'src/modules/*/domain/!(index).ts': floor(100, 69, 100),
        // `registry.ts` is the low file on functions at 66.66.
        'src/kernel/**/!(seed|store).ts': floor(70, 70, 66),
        /*
         * The access module's writers, now `src/modules/access/` (Stage 6 of the DDD fix moved
         * the folder; `seed.ts` folded into `service.ts` in the same change). Driven hard by
         * integration and contract suites, because assigning a role means writing a document —
         * the unit run imports them and calls nothing, which is what a `functions: 0` beside a
         * healthy statement count always means here. Numbers carried over from the pre-move
         * floor rather than re-measured; a ratchet, not a target — see CLAUDE.md.
         */
        'src/modules/access/repository.ts': floor(45, 100, 0),
        'src/modules/access/service.ts': floor(45, 100, 0),
        /*
         * Every subdirectory of `src/infrastructure/` carries its own key: one that falls out of
         * this list stops being measured rather than failing.
         * `tests/cross-cutting/coverage-thresholds.test.ts` is what turns that red instead.
         */
        'src/infrastructure/i18n/**/*.ts': STANDARD,
        // `create-repository.ts` sits at 33.33 functions — the factories are driven through the
        // repositories they build, which the unit run does not exercise.
        'src/infrastructure/persistence/!(lease).ts': floor(70, 70, 33),
        // A lease is a `findOneAndUpdate` race between processes; ten integration suites drive it
        // and no unit can. Statements run at import, functions do not.
        'src/infrastructure/persistence/lease.ts': floor(70, 100, 0),
        // `otel-sdk.ts` is negated out because its behaviour belongs to the OpenTelemetry runtime
        // rather than to this codebase; the other two carry their own entries below.
        'src/infrastructure/runtime/!(otel-sdk|database|server-lifecycle).ts': STANDARD,
        /*
         * Connect-retry and `stopDatabase` are driven by boot and shutdown, which no unit owns —
         * and `emptyDatabase`, `isDatabaseEmpty`, `captureDatabase` and `restoreDatabaseCopy`
         * joined them when the demo profile learned to snapshot a scenario. Each needs a live
         * connection to mean anything; `tests/integration/app/demo-restore.test.ts` is where they
         * are actually exercised. Unit-testing them would assert a mock's choreography.
         */
        'src/infrastructure/runtime/database.ts': floor(70, 100, 12),
        'src/infrastructure/runtime/server-lifecycle.ts': UNTESTED,
        // The measured minimum across the folder: `validation-messages.ts` on statements and
        // lines, `rate-limit.ts` on branches, `controller.ts` on functions.
        'src/infrastructure/http/!(controller).ts': floor(86, 42, 50),
        'src/infrastructure/http/middlewares/!(idempotency|rate-limit).ts': floor(86, 42, 50),
        // The envelope builder. Its untaken branches are the error shapes the contract suite
        // drives, and two of its four exports are only ever called by a mounted route.
        'src/infrastructure/http/controller.ts': floor(84, 66, 50),
        // Idempotency replays a stored response; half its statements only run on a real second
        // request, which is an integration concern.
        'src/infrastructure/http/middlewares/idempotency.ts': floor(73, 63, 83),
        // Best-covered middleware here on statements. The limiters themselves are factory
        // closures Express calls, never this run.
        'src/infrastructure/http/middlewares/rate-limit.ts': floor(91, 100, 40),
        'src/infrastructure/adapters/!(antibot-verdict|ssrf-guard).ts': STANDARD,
        /*
         * TYPES ONLY — a single exported union, no runtime code at all. v8 reports zero for every
         * metric because there is nothing to execute, so any floor above zero is unreachable by
         * construction rather than by neglect.
         */
        'src/infrastructure/adapters/antibot-verdict.ts': UNTESTED,
        // Reaches the network, and is driven through the webhook delivery path rather than called
        // directly — `functions: 0` beside a live statement count is that shape.
        'src/infrastructure/adapters/ssrf-guard.ts': floor(57, 100, 0),
        // Module-owned (`webhooks/transport/`), not infrastructure — see that module's page for
        // why. Same reach-the-network shape as `ssrf-guard.ts` above.
        'src/modules/webhooks/transport/webhook-delivery.ts': floor(59, 100, 0),
        'src/modules/webhooks/transport/webhook-signing.ts': STANDARD,
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
    // Redirects every file the code under test writes into a per-test-file sandbox.
    setupFilesAfterEnv: ['<rootDir>/tests/support/setup-file-sandbox.ts'],
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
        '^@modules/(.*)$': '<rootDir>/src/modules/$1',
        '^@scenarios/(.*)$': '<rootDir>/scenarios/$1',

        /*
         * The one third-party module replaced wholesale: `puppeteer-core` v25 is ESM-only and
         * cannot be parsed here. See the stub for why nothing wanted the real package anyway.
         */
        '^puppeteer-core$': '<rootDir>/tests/support/puppeteer-core.stub.ts'
    }
};
