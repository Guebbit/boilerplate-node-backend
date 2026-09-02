# docs/tools/mutation-testing.md

## Purpose

Explains the project's mutation-testing setup (Stryker): what it measures, how it differs from line coverage, the four distinct thresholds in play, the per-file ratchet (`mutation-baseline.json`), and operational details (concurrency, static mutants, incremental mode, nightly schedule). Exists so a reader can interpret mutation scores and CI failures without reading the Stryker config or the nightly workflow directly.

## Key elements

- **Four thresholds table** — distinguishes `jest.config.js` coverageThreshold (70 % line-coverage gate), `stryker.config.json` `thresholds.high/low` (report colouring only), `thresholds.break` (global run-level fail at 60), and `mutation-baseline.json` (per-file ratchet).
- **Glossary** — precise definitions: Mutant, Killed, Survived, No coverage, Timeout, Mutation score, `break` threshold, Baseline/ratchet, Nightly, Concurrency, `coverageAnalysis: perTest`, Static mutant, Incremental.
- **Danger box (service-layer exclusion)** — `mutate` covers `src/modules/*/**/*.ts` but `tests/integration/` and `tests/contract/` are excluded; 153 of 254 baseline files score 0 % for that reason. Exclusion exists to avoid a `bson` `ArrayBuffer` OOM (17 MiB buffers outside V8 heap).
- **"What a mutant actually is"** — worked example from `src/modules/cart/repository.ts` showing one source line yielding multiple mutants.
- **Per-file ratchet section** — how `mutation-baseline.json` compares each file against its own history; `npm run test:mutation:check` is the enforcement gate.
- **Operational notes** — concurrency limited by memory (each worker spawns an in-memory mongod), `coverageAnalysis: perTest` to reduce runtime, static mutants as the dominant cost, incremental mode (nightly passes `--force`).

## Relationships

- **`docs/tools/coverage-and-confidence.md`** — explicitly cross-referenced from the danger box for interpreting 0 % scores and deciding what to trust.
- **`docs/tools/package-scripts.md`** — defines the `test:mutation:check` and `test:unit:coverage` scripts this page names.
- **`docs/tools/unit-testing.md`** — the unit test suite is the killing mechanism Stryker drives; `jest.config.js` coverageThreshold lives here.
- **`docs/tools/contract-request-data.md`** — contract tests are among the suites excluded from the mutation run (see danger box).
- **`docs/reference/scripts.md`** — houses `stryker.config.json`, `mutation-baseline.json`, and the GitHub Actions nightly workflow this page describes.
- **`docs/reference/ops.md`** — operational context for the nightly cron (03:00 UTC) schedule and memory limits.
- **`docs/reference/tests.md`** — general test-suite structure (`tests/integration/`, `tests/contract/`) that scopes the exclusion.

## Notes

- A 0 % mutation score for a file in `mutation-baseline.json` does **not** mean the file is untested; it means its killing tests are in the excluded integration/contract suites. 153 of 254 files fall in this category.
- The `break: 60` threshold is a global backstop, not a per-file target. The actual day-to-day gate is the per-file ratchet (`test:mutation:check`).
- Concurrency is memory-bound, not CPU-bound: each Stryker worker runs a full test runner plus an in-memory mongod. `--max-old-space-size` does not help because the OOM source is `ArrayBuffer` backing stores, which live outside the V8 heap.
- Static mutants (code executed at module import time, e.g. `new Schema({...})`) are the single biggest runtime cost in this repo; `coverageAnalysis: perTest` cannot skip them.
- The nightly workflow passes `--force` to rebuild the incremental cache from scratch, so local incremental runs and nightly runs are not directly comparable in wall-clock time.
