/*
 * Jest configuration.
 *
 * A .js file rather than .json so the coverage thresholds can carry the explanation they need.
 * JSON cannot hold a comment, and Jest warns on any key it does not recognise, so the `_comment`
 * key that `stryker.config.json` uses would print validation noise on every run here.
 *
 * ── The two instruments, and why both ────────────────────────────────────────────────────────
 * `coverageThreshold` below answers "is this code EXECUTED by any test". `mutation-baseline.json`
 * answers "do the tests NOTICE when it changes". Coverage is the cheap check and runs in CI;
 * mutation is the expensive one and runs nightly. The `coverageThreshold` keys deliberately
 * mirror stryker's `mutate` globs: code worth mutating is code worth guaranteeing runs at all.
 * Change one list and change the other.
 */

module.exports = {
    preset: 'ts-jest',
    clearMocks: true,
    coverageProvider: 'v8',
    testEnvironment: 'node',
    testMatch: ['**/tests/**/*.test.ts'],
    testPathIgnorePatterns: ['/node_modules/', '<rootDir>/.stryker-tmp/'],
    modulePathIgnorePatterns: ['<rootDir>/.stryker-tmp/'],
    collectCoverageFrom: ['src/**/*.ts', '!src/types/**', '!src/**/*.d.ts'],
    /*
     * PER-FILE floors. The glob syntax is the whole point and it is not cosmetic.
     *
     * A threshold key that names a DIRECTORY ('src/services/') is applied by Jest to every file
     * beneath it as ONE POOLED TOTAL. A key that is a GLOB (`src/services` followed by a recursive .ts wildcard) is applied to
     * each matching file separately, and Jest prints one failure per file, naming it.
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
     *   src/core/http/      100   / 96.29 / 100 / 100
     *   src/middlewares/     77.09 / 83.33 /  80 /  77.09
     *   src/models/         100   / 75    /  75 / 100
     *   src/repositories/    98.37 / 88.23 / 100 /  98.37
     *   src/services/        88.34 / 90.62 /  80 /  88.34
     *
     * Kept in step with stryker.config.json's `mutate` array, on the principle that logic worth
     * mutating is logic worth guaranteeing is executed at all. Add a path to one, add it here.
     *
     * CONTROLLERS ARE DELIBERATELY NOT FLOORED, and it is a decision rather than an oversight.
     * They report ~0% on the UNIT run because they are covered by `tests/contract/` and
     * `tests/integration/`, which drive the real app over HTTP — a legitimate choice for handlers
     * this thin. A floor on this run would be measuring the wrong suite, and the only way to
     * satisfy it would be unit tests duplicating the contract suite less well. If controllers
     * ever need a floor it belongs on a coverage run that includes those suites.
     */
    coverageThreshold: {
        'src/core/http/**/*.ts': {
            statements: 70,
            branches: 70,
            functions: 70,
            lines: 70
        },
        'src/middlewares/**/*.ts': {
            statements: 70,
            branches: 70,
            functions: 70,
            lines: 70
        },
        'src/models/**/*.ts': {
            statements: 70,
            branches: 70,
            functions: 70,
            lines: 70
        },
        'src/repositories/**/*.ts': {
            statements: 70,
            branches: 70,
            functions: 70,
            lines: 70
        },
        'src/services/**/*.ts': {
            statements: 70,
            branches: 70,
            functions: 70,
            lines: 70
        },
        'src/jobs/**/*.ts': { statements: 70, branches: 70, functions: 70, lines: 70 },

        /*
         * Core, minus the four files written down below.
         *
         * `bootstrap` and `tracer.ts` are absent here for the same reason they are excluded from
         * `mutate`: their behaviour belongs to the runtime, not to this codebase.
         */
        'src/core/*.ts': { statements: 70, branches: 70, functions: 70, lines: 70 },
        'src/core/http/**/*.ts': { statements: 70, branches: 70, functions: 70, lines: 70 },
        'src/core/adapters/!(pdf|mailer).ts': {
            statements: 70,
            branches: 70,
            functions: 70,
            lines: 70
        },
        'src/core/observability/!(stream|metrics-http|tracer).ts': {
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
         *                      of dissolved into the `src/core/` average.
         *   stream.ts     0% — the SSE broadcast hub. Same: no suite drives it today.
         *   mailer.ts        — transport/template branches; only the happy path is driven.
         *   metrics-http     — several exported helpers are reachable only from a live scrape.
         *
         * All four are also in `mutate`, so `mutation-baseline.json` records them too and the two
         * instruments move together as they gain tests.
         */
        'src/core/adapters/pdf.ts': { statements: 0, branches: 0, functions: 0, lines: 0 },
        'src/core/observability/stream.ts': {
            statements: 0,
            branches: 0,
            functions: 0,
            lines: 0
        },
        'src/core/adapters/mailer.ts': {
            statements: 85,
            branches: 50,
            functions: 100,
            lines: 85
        },
        'src/core/observability/metrics-http.ts': {
            statements: 80,
            branches: 90,
            functions: 60,
            lines: 80
        }
    },
    globalSetup: '<rootDir>/tests/helpers/global-setup.ts',
    setupFiles: ['<rootDir>/tests/helpers/setup.ts'],
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
        '^@controllers/(.*)$': '<rootDir>/src/controllers/$1',
        '^@services/(.*)$': '<rootDir>/src/services/$1',
        '^@repositories/(.*)$': '<rootDir>/src/repositories/$1',
        '^@models/(.*)$': '<rootDir>/src/models/$1',
        '^@middlewares/(.*)$': '<rootDir>/src/middlewares/$1',
        '^@jobs/(.*)$': '<rootDir>/src/jobs/$1',
        '^@core/(.*)$': '<rootDir>/src/core/$1'
    }
};
