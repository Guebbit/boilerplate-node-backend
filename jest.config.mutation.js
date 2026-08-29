/*
 * Jest configuration used ONLY by Stryker (`npm run test:mutation`).
 *
 * This run is the PRIMARY judgement of test quality in this repository — the coverage floors in
 * `jest.config.js` are a fast proxy for it, not a second opinion. See
 * docs/tools/coverage-and-confidence.md.
 *
 * Identical to `jest.config.js` except for the transform, which is swc instead of ts-jest.
 * The frontend keeps the mirror of this file at `vitest.config.mutation.ts`, for the same reason:
 * the mutation run is the same run, with the parts that make no sense per-mutant removed.
 *
 * ── WHY ──────────────────────────────────────────────────────────────────────────────────────────
 * ts-jest does two jobs: it translates TypeScript to JavaScript, and it TYPE-CHECKS. The second
 * needs a TypeScript `LanguageService`, which holds a program and a document registry in memory so
 * it does not have to rebuild them.
 *
 * That cache is an asset in a normal run and a liability here. Stryker calls jest repeatedly inside
 * ONE process, and every mutant gives a file new contents — so every mutant is a new document
 * version, the registry grows, and nothing evicts it. Measured 2026-08-14 on a single file whose
 * tests open no database: 3963 MB -> 4447 MB -> 5045 MB across four mutants, past Node's 4288 MB
 * default cap, after which the worker is killed and restarted having finished nothing. The run
 * reported 36 hours remaining and was not converging. See
 * `docs/tools/mutation-testing.md#when-a-run-never-finishes-—-the-oom-strand-loop`.
 *
 * swc only translates. It strips the types and returns JavaScript, checking nothing, so it retains
 * nothing between mutants.
 *
 * ── WHAT THIS DOES NOT COST ──────────────────────────────────────────────────────────────────────
 * No type safety is lost. `npm run ts-check` type-checks the whole project once, in `npm run
 * complete`, before any of this runs. Re-checking the same types once per mutant cannot find a
 * different answer — a mutant changes an expression, not a signature — so the second check is pure
 * cost. A type error reaches this file only if the gate that precedes it was skipped.
 *
 * ── WHAT TO WATCH ────────────────────────────────────────────────────────────────────────────────
 * swc transpiles file-by-file with no cross-file knowledge, which is what makes it cheap and is
 * also its one constraint: a type-only import must be written `import type`, or swc emits a real
 * require for a value that does not exist at runtime. The app is already written that way — see
 * `verbatimModuleSyntax` in `tsconfig.json` — so this is a property to preserve rather than one to
 * establish.
 */
const baseConfig = require('./jest.config');

module.exports = {
    ...baseConfig,
    // `preset` is dropped along with it: the ts-jest preset is what installs the transform this
    // file exists to replace, and leaving it would put ts-jest back under a different key.
    preset: undefined,
    /*
     * ── ONE WORKER, BECAUSE STRYKER IS ALREADY THE POOL ──────────────────────────────────────────
     * `jest.config.js` sizes its pool for a STANDALONE run: one jest, `logical CPUs - 2` workers,
     * measured against the whole unit suite. Inherited here that number is multiplied rather than
     * reused — Stryker runs `concurrency` test runners at once, each of which is a full jest, so
     * this machine's 30 became 4 × 30 and the run spent its time context-switching. Measured on a
     * 32-core box: load average 31.8 with four Stryker workers, ~55s per mutant, against a suite
     * that runs 703 tests in 78 seconds single-threaded.
     *
     * There is nothing for a pool to do here in any case. `coverageAnalysis: "perTest"` narrows
     * each mutant to the tests that actually reach it — usually a handful in one or two files —
     * and a pool cannot parallelise below a file. The parallelism belongs to Stryker, which spends
     * it on mutants; `STRYKER_CONCURRENCY` in `.env` is the one knob, and this keeps it honest.
     *
     * It also fixes the memory arithmetic the base config's comment works through: peak RSS is
     * per worker, and four runners each holding a 30-worker pool is not a budget anyone sized.
     */
    maxWorkers: 1,
    transform: {
        '^.+\\.tsx?$': [
            '@swc/jest',
            {
                jsc: {
                    parser: { syntax: 'typescript' },
                    // Matches the `target` the app is compiled with; swc emits for the runtime,
                    // not for a browser matrix.
                    target: 'es2022'
                },
                // Jest's runtime is CommonJS, so `import()` has to be downlevelled the way ts-jest
                // downlevels it. Several suites use dynamic import.
                module: { type: 'commonjs' }
            }
        ]
    }
};
