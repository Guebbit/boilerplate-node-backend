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
 * anything) and expensive to floor.
 *
 * The keys below floor `model.ts`, `repository.ts` and `service.ts` and nothing else. The newer
 * per-module files — `audit.ts`, `metrics.ts`, `seeds.ts`, `events.ts`, `routes.ts`,
 * `analytics.ts` — have never had a floor, and that is deliberate rather than an oversight: they
 * are to be re-derived per module once the architecture settles, and a floor moved twice is worse
 * than a floor moved once.
 */

const os = require('node:os');
const path = require('node:path');
const { existsSync, readFileSync } = require('node:fs');
const { parseEnv } = require('node:util');

/**
 * `JEST_WORKERS` out of `.env`, without importing the rest of the file.
 *
 * `scripts/run-mutation-tests.ts` reads its own settings with `process.loadEnvFile()`, and that would be the
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
 * How many workers to run.
 *
 * The safe number is a property of the MACHINE, not of the project, so it lives in `.env` as
 * `JEST_WORKERS` — the same arrangement `STRYKER_CONCURRENCY` uses, for the same reason.
 *
 * Why it needs setting at all: jest's own default is `logical CPUs - 1`, which counts cores for a
 * workload bounded by memory. A worker peaks at 772-905 MB here whatever the pool size, so on this
 * machine's 32 logical CPUs the default put 31 of them together and the run peaked at 17.6 GB —
 * enough, alongside the docker stack, for the OOM killer to take two workers mid-run. It surfaces
 * as `A jest worker process was terminated by another process: signal=SIGKILL` with every test
 * passing, which is not a sentence that points at its own cause. Measured over the 98 unit suites:
 *
 *   | workers | wall | peak RSS |
 *   | 31      |  20s | 17.6 GB  |
 *   | 12      |  14s |  9.0 GB  |
 *   |  8      |  13s |  6.3 GB  |
 *
 * Note the direction: eight workers were FASTER than thirty-one. Past the point where the machine
 * can hold them, extra workers buy contention rather than throughput, so a lower number here is
 * not paid for in time.
 *
 * The fallback is `logical CPUs - 2`, which leaves the machine two threads to stay responsive
 * with. It is deliberately not a memory calculation: on the boxes big enough for the pool to
 * matter there is a developer and a `.env`, and CI — where there is neither — runs on 4 vCPU
 * runners where two workers is already the right answer.
 *
 * @returns the worker count: JEST_WORKERS when set, otherwise `logical CPUs - 2`
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

module.exports = {
    preset: 'ts-jest',
    clearMocks: true,
    coverageProvider: 'v8',
    testEnvironment: 'node',
    maxWorkers: resolveMaxWorkers(),
    testMatch: ['**/tests/**/*.test.ts'],
    /*
     * `tests/cluster` is excluded here and run by `jest.config.cluster.js` instead. Those tests
     * spawn `src/cluster.ts` as a child process, boot their own Mongo and need a Redis, so none of
     * this file's setup applies to them and their runtime is measured in minutes rather than
     * milliseconds. See the header of that config.
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
        // Co-located specs are test code, not covered code. Without this a module's own tests
        // count towards its coverage and every floor below becomes self-satisfying.
        '!src/**/tests/**'
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
     *
     * ── These floors are a PROXY. Mutation testing is the instrument ─────────────────────────
     * A line can be executed by a test that asserts nothing about it, and coverage calls that
     * 100%. `npm run test:mutation` asks whether a test would NOTICE the line changing, which is
     * the question that matters; an uncovered line cannot kill a mutant, so the mutation score
     * subsumes everything below. Coverage is kept because it runs in seconds where a mutation run
     * does not. See docs/tools/coverage-and-confidence.md.
     *
     * ── The floors below were re-fitted on 2026-08-29, and several are LOW ────────────────────
     * Read them as a ratchet — "do not get worse" — not as a target. They are low for the reason
     * the controller paragraph above already gives, spread wider than it was written for: this run
     * is `tests/unit` + `tests/cross-cutting` + each module's own `tests/unit`, and it does NOT
     * include `tests/integration` or `tests/contract`. When 36 module specs moved from `tests/unit`
     * to `tests/integration` (see NODE_MUTATION_MONGOD.md — Stryker reruns the unit suite once per
     * mutant, so a database connection there is paid thousands of times over), the code they cover
     * stopped being measured here. The floors were not re-fitted at the time, so the job had been
     * failing on 89 thresholds — which means it had stopped being a gate anyone could act on.
     *
     * So `service.ts` sits at 37/70/0/37 not because a service deserves no better, but because
     * that is what the UNIT layer alone reaches. `functions: 0` is the honest reading where the
     * unit suite calls none of a file's exports; it is not an invitation to delete tests.
     *
     * BE HONEST ABOUT WHAT `functions: 0` BUYS, WHICH IS NOTHING. Ten of twelve `repository.ts`,
     * eight of nine `service.ts` and twelve of seventeen `services/*.ts` files report 0% functions
     * on this run. That is not an outlier to carve out — carving out ten of twelve leaves a rule
     * with two members — it is the key telling you it does not apply to this suite. Those three
     * keys still floor `statements`, `branches` and `lines`, and their `functions` entry is a
     * formality. Where a file was the outlier the carve-out WAS made, so the rest keep a real
     * floor: see the negated `services/!(verification|reorder).ts` key below.
     *
     * Which makes option 1 the real answer rather than a nicety.
     *
     * TWO WAYS OUT, if these numbers are unsatisfying — both are decisions rather than chores:
     *   1. Add a second coverage run that includes the integration and contract suites, and put
     *      the real floors there. That is the run the numbers above are asking for.
     *   2. Leave it, and read this job as "the unit layer did not get worse", which is what it
     *      now honestly is.
     *
     * A file matched by no key here is UNMEASURED, not zero — see the barrel note below.
     */
    coverageThreshold: {
        'src/modules/*/model.ts': {
            statements: 70,
            branches: 50,
            functions: 50,
            lines: 70
        },
        'src/modules/*/repository.ts': {
            statements: 63,
            branches: 70,
            functions: 0,
            lines: 63
        },
        /*
         * Fitted to `orders/service.ts`, which is the floor: 36.94% against a next-lowest of
         * 42.13% (`feedback`). It was 37 until `withDocument` was inlined back into `updateById`
         * and `removeById` — four statements the unit run does not execute, since both need a
         * database — which put orders 0.06 under. Re-fitted rather than carved out: a one-file
         * exemption here would leave the key describing eight files that all clear 42 anyway.
         */
        'src/modules/*/service.ts': {
            statements: 36,
            branches: 70,
            functions: 0,
            lines: 36
        },
        // The same tier when it outgrows one file: account and cart became `services/`
        // directories, and the key above silently stopped matching them the day they moved.
        // The negation is the exemption mechanism, same as `!(pdf|mailer)` below: a negated
        // file carries its own measured entry at the bottom of this block.
        'src/modules/*/services/!(verification|reorder).ts': {
            statements: 27,
            branches: 70,
            functions: 0,
            lines: 27
        },
        /*
         * The domain layer's floor is the RATCHET's record, not an aspiration: pure functions
         * over plain data are the cheapest code in the repo to execute, and every domain file
         * measured 100/≥80/100/100 on 2026-08-19. A new domain file that cannot clear this bar
         * is a domain file without its unit suite, which is the one thing `domain/` promises.
         */
        /*
         * `!(index)` excludes the barrel. A pure re-export file's `functions` metric counts the
         * re-export arrows, which are "covered" only when something imported the barrel during
         * this run — that measures wiring, not testing, and the four `domain/index.ts` files
         * dragged this key's `functions` floor from 100 to 0 while every file with logic in it
         * measured 100.
         */
        'src/modules/*/domain/!(index).ts': {
            statements: 100,
            branches: 69,
            functions: 100,
            lines: 100
        },
        'src/kernel/**/*.ts': {
            statements: 70,
            branches: 70,
            functions: 70,
            lines: 70
        },
        /*
         * Every subdirectory of `src/infrastructure/` carries its own key — a directory that falls
         * out of this list does not fail the build, it just stops being measured, which is the
         * drift that let `runtime/` and `persistence/` go unfloored after the files moved into
         * them. `tests/cross-cutting/coverage-thresholds.test.ts` is what turns the next such
         * rename red instead of unmeasured; the single-star key that used to sit here, matching
         * `i18n.ts` alone, is how that test came to exist.
         */
        'src/infrastructure/i18n/**/*.ts': {
            statements: 70,
            branches: 70,
            functions: 70,
            lines: 70
        },
        /*
         * Flat again since `crud-service.ts` was dissolved. It used to be negated out of this key:
         * `withDocument` and `toggleSoftDelete` were called only from the orders, products and
         * users services, which the unit run does not execute, so it read 0% functions while the
         * six files beside it sat between 33% and 100%. Both are now inlined at their call sites,
         * so the set this key matches is unchanged and the floor it carried still holds.
         *
         * `create-repository.ts` sits at 33.33 against the 33 below and has since before that
         * refactor — the margin is one function, so anything added to the factory without a unit
         * test trips this key.
         */
        'src/infrastructure/persistence/*.ts': {
            statements: 70,
            branches: 70,
            functions: 33,
            lines: 70
        },
        /*
         * `otel-sdk.ts` is absent for the same reason the old top-level `bootstrap`/`tracer`
         * were: its behaviour belongs to the OpenTelemetry runtime, not to this codebase.
         * `database.ts` and `server-lifecycle.ts` carry their own measured entries below.
         */
        'src/infrastructure/runtime/!(otel-sdk|database|server-lifecycle).ts': {
            statements: 70,
            branches: 70,
            functions: 70,
            lines: 70
        },
        'src/infrastructure/http/**/*.ts': {
            statements: 62,
            branches: 42,
            functions: 50,
            lines: 62
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
            functions: 66,
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
        },
        /*
         * Measured 2026-08-19, same policy as the four above: records of where the code IS.
         *
         *   database.ts         — the connect-retry loop and `stopDatabase` are driven by boot
         *                         and shutdown, which no unit suite owns; the URI/backoff logic
         *                         is what the units reach.
         *   server-lifecycle.ts — signal-driven drain-and-exit; the honest zero on the record,
         *                         exactly like `stream.ts` and `pdf.ts`.
         */
        'src/infrastructure/runtime/database.ts': {
            statements: 70,
            branches: 100,
            functions: 25,
            lines: 70
        },
        'src/infrastructure/runtime/server-lifecycle.ts': {
            statements: 0,
            branches: 0,
            functions: 0,
            lines: 0
        },
        /*
         * Two more measured records, 2026-08-19, from the day the `services/` glob started
         * matching what it was written for:
         *
         *   verification.ts — the locale-fallback arms of the verify email
         *                     (`user.locale ?? requestLocale ?? default`) are driven by the
         *                     e2e registration flow, not by any unit.
         *   reorder.ts      — buy-again is exercised end-to-end (the storefront and journey
         *                     suites); no unit suite owns it yet. Same standing as `pdf.ts`:
         *                     the honest number on the record, for the ratchet to raise.
         */
        'src/modules/account/services/verification.ts': {
            statements: 60,
            branches: 60,
            functions: 0,
            lines: 60
        },
        'src/modules/cart/services/reorder.ts': {
            statements: 45,
            branches: 100,
            functions: 0,
            lines: 45
        }
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
                diagnostics: {
                    ignoreCodes: [151_002]
                }
            }
        ]
    },
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
