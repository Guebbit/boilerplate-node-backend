/*
 * Jest configuration.
 *
 * A .js file rather than .json so the coverage thresholds can carry the explanation they need.
 * JSON cannot hold a comment, and Jest warns on any key it does not recognise, so the `_comment`
 * key that `stryker.config.json` uses would print validation noise on every run here.
 *
 * ── The two instruments, and why both ────────────────────────────────────────────────────────
 * `coverageThreshold` below answers "is this code EXECUTED by any test". The per-file mutation
 * ratchet answers "do the tests NOTICE when it changes". Coverage is the cheap check and runs in
 * CI; mutation is the expensive one and runs nightly.
 *
 * The two lists are related but not identical: `stryker.config.json`'s `mutate` is the wider of
 * the two, because a file with no coverage is free to mutate (it is reported without running
 * anything) and expensive to floor. The keys below are being re-derived per module — see
 * `docs/theory/known-gaps.md` §4.
 */

const os = require('node:os');
const path = require('node:path');
const { existsSync, readFileSync } = require('node:fs');
const { parseEnv } = require('node:util');

/**
 * `JEST_WORKERS` out of `.env`, without importing the rest of the file.
 *
 * `scripts/mutation.ts` reads its own settings with `process.loadEnvFile()`, and that would be the
 * obvious thing to copy here — but it is a standalone script and this is the test runner's config.
 * `loadEnvFile` MERGES `.env` into `process.env`, and jest hands its environment to every worker,
 * so doing it here silently republishes the whole development environment into the suite. It was
 * tried: `tests/support/setup.ts` raises the rate limits with `??=`, which assigns only when a
 * variable is unset, so the real `NODE_RATE_LIMIT_MAX=100` and `NODE_AUTH_RATE_LIMIT_MAX=10`
 * arrived first and the concurrency suites started answering 429 to their own fixtures.
 *
 * `parseEnv` parses the same format and returns a plain object, touching nothing. One variable is
 * wanted here, so one variable is what crosses over.
 *
 * @returns the file's variables, or an empty object when there is no `.env` — the normal case in CI
 */
const readEnvFile = () => {
    const envFile = path.join(__dirname, '.env');
    // Checked rather than caught: a checkout without a `.env` is ordinary, not exceptional.
    return existsSync(envFile) ? parseEnv(readFileSync(envFile, 'utf8')) : {};
};

/**
 * Measured RSS of one worker running this suite, in MB.
 *
 * Not a guess: sampled across the 98 unit suites on 2026-08-15, where a worker peaked between
 * 772 MB and 905 MB regardless of how many were running. The figure is stable because it is
 * dominated by fixed per-worker costs — ts-jest's TypeScript program and the module graph — plus
 * `bson`'s 17 MiB module-scope buffer, which jest re-allocates for every test FILE because a
 * fresh module registry is what test isolation means. See the case study in
 * `docs/tools/mutation-testing.md`.
 */
const WORKER_RSS_MB = 900;

/**
 * How many workers to run.
 *
 * Jest's default is `logical CPUs - 1`, and on this machine that is 31 — which is how a test run
 * came to peak at 17.6 GB of RSS and get two of its workers SIGKILLed by the OOM killer mid-run.
 * The failure reads as `A jest worker process was terminated by another process: signal=SIGKILL`
 * with every test passing, which is not a sentence that points at its own cause.
 *
 * The default is wrong here because it counts CORES for a workload bounded by MEMORY. Measured on
 * the same 98 suites, same machine (32 logical CPUs, 30.5 GB):
 *
 *   | workers | wall | peak RSS |
 *   | 31      |  20s | 17.6 GB  |
 *   | 12      |  14s |  9.0 GB  |
 *   |  8      |  13s |  6.3 GB  |
 *
 * Note the direction: eight workers were FASTER than thirty-one. Past the point where the
 * machine can hold them, extra workers buy contention, not throughput — so this cap costs
 * nothing to buy back 11 GB.
 *
 * The pool is therefore sized from whichever runs out first, RAM or cores. A quarter of total
 * memory is the share taken, deliberately less than half: a test run does not own the machine —
 * on a development box it shares one with the docker stack this repo also starts, and on CI with
 * whatever else the runner hosts.
 *
 * @returns the worker count: JEST_WORKERS when set, otherwise the derived cap
 */
const resolveMaxWorkers = () => {
    // A real environment variable wins over the file, so a one-off run can go lower without
    // editing anything: `JEST_WORKERS=2 npm run test:unit`.
    const setting = process.env.JEST_WORKERS ?? readEnvFile().JEST_WORKERS;
    const configured = Number(setting?.trim());
    if (Number.isInteger(configured) && configured > 0) return configured;

    const totalMemoryMb = os.totalmem() / 1024 / 1024;
    const byMemory = Math.floor((totalMemoryMb * 0.25) / WORKER_RSS_MB);
    const byCpu = os.cpus().length - 1;

    // At least one, or a small container would compute zero workers and run nothing.
    return Math.max(1, Math.min(byCpu, byMemory));
};

module.exports = {
    preset: 'ts-jest',
    clearMocks: true,
    coverageProvider: 'v8',
    testEnvironment: 'node',
    maxWorkers: resolveMaxWorkers(),
    testMatch: ['**/tests/**/*.test.ts'],
    testPathIgnorePatterns: ['/node_modules/', '<rootDir>/.stryker-tmp/', '<rootDir>/.tmp/'],
    modulePathIgnorePatterns: ['<rootDir>/.stryker-tmp/', '<rootDir>/.tmp/'],
    collectCoverageFrom: [
        'src/**/*.ts',
        '!src/types/**',
        '!src/**/*.d.ts',
        // Co-located specs are test code, not covered code. Without this a module's own tests
        // count towards its coverage and every floor below becomes self-satisfying.
        '!src/**/tests/**',
        // Contract fragments are text slices assembled by `npm run contracts:bundle`, not modules:
        // nothing imports one and most are not valid TypeScript alone, so instrumenting them would
        // report a permanent 0% for files no test can execute. The bundle they build is covered.
        '!src/**/*.fragment.ts'
    ],
    /*
     * PER-FILE floors. The glob syntax is the whole point and it is not cosmetic.
     *
     * A threshold key that names a DIRECTORY ('src/modules/') is applied by Jest to every file
     * beneath it as ONE POOLED TOTAL. A key that is a GLOB (a path with a wildcard segment, or one
     * followed by a recursive .ts wildcard) is applied to each matching file separately, and Jest
     * prints one failure per file, naming it.
     *
     * NOTE for whoever edits this comment: a glob written out in full would close the block comment
     * on its wildcard-then-slash, which is why every example here is spelled in words.
     *
     * A second trap, learned when the domains became modules: a threshold key matching NO file is
     * silently ignored. The old services key stayed in this config after that directory was
     * emptied, and enforced nothing while reading like a gate. Renaming a source directory means
     * re-checking these keys — the failure mode is a green run, not an error.
     *
     * The difference is not academic. Under the pooled form this repo passed a 70% floor on
     * src/middlewares/ while auth-jwt.ts, locale.ts and security.ts each sat at 0%, and on
     * src/services/ while services/audit-logs.ts sat at 0% — four files with no test at all,
     * inside two green gates. security.ts in particular is not a bare config object: it holds
     * isMetricsScraper, the credential check on the Prometheus endpoint.
     *
     * Those four now have unit suites, so as of 2026-08-08 NO file in any of these paths needs a
     * written-down exemption. If one ever does, the mechanism is: exclude it from the glob with an
     * extglob negation (e.g. `src/middlewares/!(security).ts`) AND give it its own key at its
     * measured value. It cannot simply be given a lower key alongside the glob — Jest adds a file
     * to EVERY matching group rather than picking the most specific, so both checks would run and
     * the stricter one would still fail it. An exemption has to leave the glob to be an exemption.
     *
     * The floor stays at the 70 the pooled gates already carried: this change is about WHICH files
     * are measured, not about raising the bar in the same commit. The measured per-path minima on
     * 2026-08-08, for whoever raises it next (statements / branches / functions / lines):
     *
     *   src/infrastructure/http/      100   / 96.29 / 100 / 100
     *   src/middlewares/     77.09 / 83.33 /  80 /  77.09
     *   src/models/         100   / 75    /  75 / 100
     *   src/repositories/    98.37 / 88.23 / 100 /  98.37
     *   src/services/        88.34 / 90.62 /  80 /  88.34
     *
     * The last three paths no longer exist: those files are now `src/modules/<name>/model.ts`,
     * `repository.ts` and `service.ts`, and the keys below follow them. The numbers are left as the
     * 2026-08-08 record they were taken as — they were never per-module and re-measuring them per
     * module is the job of whoever raises the floor, not of the move that renamed the paths.
     *
     * The principle behind which paths appear here: logic worth mutating is logic worth
     * guaranteeing is executed at all. A path added to `stryker.config.json`'s `mutate` is a
     * candidate for a floor here, once it has a measurement to floor it at.
     *
     * Co-located specs (`src/modules/<name>/tests/`) are excluded from `collectCoverageFrom`
     * above. They match `src/**` like any other source file, and counting a module's own tests
     * towards its coverage would make every floor here self-satisfying.
     *
     * CONTROLLERS ARE DELIBERATELY NOT FLOORED, and it is a decision rather than an oversight.
     * They report ~0% on the UNIT run because they are covered by `tests/contract/` and
     * `tests/integration/`, which drive the real app over HTTP — a legitimate choice for handlers
     * this thin. A floor on this run would be measuring the wrong suite, and the only way to
     * satisfy it would be unit tests duplicating the contract suite less well. If controllers
     * ever need a floor it belongs on a coverage run that includes those suites.
     */
    coverageThreshold: {
        'src/modules/*/model.ts': {
            statements: 70,
            branches: 70,
            functions: 70,
            lines: 70
        },
        'src/modules/*/repository.ts': {
            statements: 70,
            branches: 70,
            functions: 70,
            lines: 70
        },
        'src/modules/*/service.ts': {
            statements: 70,
            branches: 70,
            functions: 70,
            lines: 70
        },
        'src/kernel/**/*.ts': {
            statements: 70,
            branches: 70,
            functions: 70,
            lines: 70
        },
        /*
         * Core, minus the four files written down below.
         *
         * `bootstrap` and `tracer.ts` are absent here for the same reason they are excluded from
         * `mutate`: their behaviour belongs to the runtime, not to this codebase.
         */
        'src/infrastructure/*.ts': { statements: 70, branches: 70, functions: 70, lines: 70 },
        'src/infrastructure/http/**/*.ts': {
            statements: 70,
            branches: 70,
            functions: 70,
            lines: 70
        },
        'src/infrastructure/adapters/!(pdf|mailer).ts': {
            statements: 70,
            branches: 70,
            functions: 70,
            lines: 70
        },
        'src/infrastructure/observability/!(stream|metrics-http|tracer).ts': {
            statements: 70,
            branches: 70,
            functions: 70,
            lines: 70
        },
        /*
         * The analytics providers, one directory deeper. Listed separately because the glob above
         * ends in `.ts` and matches only files sitting directly in `observability/` — when
         * `analytics.ts` became `analytics/`, it silently stopped being covered by any threshold
         * at all. A directory that falls out of this list does not fail the build; it just stops
         * being measured, which is the failure mode worth naming.
         */
        'src/infrastructure/observability/analytics/**/*.ts': {
            statements: 70,
            branches: 70,
            functions: 70,
            lines: 70
        },

        /*
         * The exemptions, each at its measured value on 2026-08-09 rounded down to a multiple of
         * 5. These are records of where the code IS, not targets — a drop fails the build, an
         * improvement should be ratcheted up.
         *
         *   pdf.ts        0% — the puppeteer PDF adapter. Genuinely untested by any suite; it
         *                      launches a browser. The honest zero is now on the record instead
         *                      of dissolved into the `src/infrastructure/` average.
         *   stream.ts     0% — the SSE broadcast hub. Same: no suite drives it today.
         *   mailer.ts        — transport/template branches; only the happy path is driven.
         *   metrics-http     — several exported helpers are reachable only from a live scrape.
         *
         * All four are also in `mutate`, so the mutation ratchet records them too and the two
         * instruments move together as they gain tests.
         */
        'src/infrastructure/adapters/pdf.ts': {
            statements: 0,
            branches: 0,
            functions: 0,
            lines: 0
        },
        'src/infrastructure/observability/stream.ts': {
            statements: 0,
            branches: 0,
            functions: 0,
            lines: 0
        },
        'src/infrastructure/adapters/mailer.ts': {
            statements: 85,
            branches: 50,
            functions: 100,
            lines: 85
        },
        'src/infrastructure/observability/metrics-http.ts': {
            statements: 80,
            branches: 90,
            functions: 60,
            lines: 80
        }
    },
    globalSetup: '<rootDir>/tests/support/global-setup.ts',
    globalTeardown: '<rootDir>/tests/support/global-teardown.ts',
    setupFiles: ['<rootDir>/tests/support/setup.ts'],
    testTimeout: 30000,
    transform: {
        '^.+\\.tsx?$': [
            'ts-jest',
            {
                tsconfig: 'tsconfig.jest.json',
                diagnostics: {
                    ignoreCodes: [151002]
                }
            }
        ]
    },
    moduleNameMapper: {
        '^@api/(.*)$': '<rootDir>/api/$1',
        '^@types$': '<rootDir>/src/types',
        '^@seed-identities$': '<rootDir>/db/seeds/seed-identities',
        '^@tests/(.*)$': '<rootDir>/tests/support/$1',
        '^@app/(.*)$': '<rootDir>/src/app/$1',

        '^@infrastructure/(.*)$': '<rootDir>/src/infrastructure/$1',
        '^@kernel/(.*)$': '<rootDir>/src/kernel/$1',
        '^@modules/(.*)$': '<rootDir>/src/modules/$1'
    }
};
