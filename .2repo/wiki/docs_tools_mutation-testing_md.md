# docs/tools/mutation-testing.md

## Purpose

Explains how and why this project uses Stryker mutation testing to verify that the test suite actually asserts meaningful behaviour, not just that code executes. Serves as the conceptual and operational reference for interpreting mutation scores, the per-file ratchet (`mutation-baseline.json`), and the known limitations of the current run (service-layer exclusion, static-mutant cost).

## Key elements

- **Stryker configuration** (`stryker.config.json`) — sets `coverageAnalysis: perTest`, concurrency, thresholds (`high`/`low` for report colouring, `break: 60` as a global backstop), and the file globs it mutates.
- **`mutation-baseline.json` (the ratchet)** — per-file score history. `npm run test:mutation:check` compares each file to its own last score; regressions fail the job, improvements are written back. This is the day-to-day gate, not the `break` threshold.
- **Outcome vocabulary** — *killed*, *survived*, *no coverage*, *timeout* (counts as killed), *error*. The page defines each precisely and distinguishes survived from no-coverage.
- **Static mutants** — mutants in module-scope code (e.g. `new Schema({...})`, top-level repository construction). Identified as the single largest cost in this repo's runs because `perTest` analysis cannot skip them.
- **Incremental mode** — Stryker caches per-mutant results in a committed file; nightly runs pass `--force` to rebuild.
- **Concurrency** — parallel mutant processes, each running a full Jest runner + in-memory `mongod`. Bounded by memory (ArrayBuffer backing stores), not CPU cores.
- **Service-layer exclusion** — `tests/integration/`, `tests/contract/` are excluded from the mutation run while `src/modules/*/**/*.ts` is still mutated, causing 153/254 baseline files to score 0%. Documented as a `bson` leak workaround, not an oversight.
- **Nightly GitHub Actions workflow** — cron at 03:00 UTC; nothing blocks on it; reports next morning.

## Relationships

- **`docs/tools/coverage-and-confidence.md`** — explicitly linked from the danger note; explains what a 0% mutation score does and does not mean and how to interpret the four coexisting percentage thresholds.
- **`docs/reference/scripts.md`** / **`docs/tools/package-scripts.md`** — the `test:mutation:check`, `test:unit:coverage`, and related `npm run` scripts are defined there; this page references them as entry points.
- **`docs/reference/ops.md`** — the nightly cron workflow and CI job structure that schedules and reports mutation runs live there.
- **`docs/tools/contract-request-data.md`** — contract tests are part of the excluded suites (`tests/contract/`); understanding why they are excluded requires context from that page.
- **`docs/tools/concurrency-testing.md`** — shares the "parallel processes each spawning a full test runner + in-memory mongod" constraint; the concurrency limit discussed here is the same resource budget.
- **`docs/tools/unit-testing.md`** — mutation testing operates *on* the unit/integration test suite; the "killed by a test" outcome depends on the assertions described there.
- **`docs/reference/tests.md`** — the test-file layout (`tests/integration/`, `tests/contract/`, `src/modules/*/**/*.ts`) referenced by the exclusion logic is documented there.

## Notes

- **Four percentages, one gate.** `jest.config.js` line-coverage threshold (70%), Stryker `high`/`low` (80/60, cosmetic only), Stryker `break` (60, global backstop), and the baseline ratchet (per-file, no fixed number) are all in play. Only the ratchet fails day-to-day PRs; `break` catches whole-run collapse.
- **OOM is not fixable via heap flags.** The 17 MiB buffers that cause the 23 OOMs are `ArrayBuffer` backing stores outside V8's heap bounds; `--max-old-space-size` cannot help.
- **Survived ≠ untested.** "No coverage" (nothing ran the code) costs zero and is easy to triage; "survived" (tests ran but asserted nothing) is the actionable finding. The page stresses keeping these distinct.
- **`perTest` is the speed mechanism, not a correctness feature.** It narrows which tests run per mutant. Static mutants bypass it entirely, which is why they dominate runtime.
