# docs/tools/mutation-testing.md

## Purpose

Explains the project's mutation-testing workflow (powered by Stryker): what a mutant is, how to interpret kill/survive/no-coverage outcomes, how thresholds and the per-file ratchet gate CI, and the operational details that make runs fast (per-test coverage analysis, incremental mode, concurrency limits). Exists so developers can act on a "survived" finding without re-deriving the tool's vocabulary each time.

## Key elements

- **Conceptual model** — Distinguishes line coverage (did the code run?) from mutation testing (do tests assert on the result?). Provides a Mermaid flowchart of the kill/survive/no-coverage decision tree.
- **Four-numbers table** — Lays out the four distinct percentages: `jest.config.js` 70 % line-coverage gate, `stryker.config.json` `high`/`low` (80/60, report colour only), `stryker.config.json` `break: 60` (global run failure), and `mutation-baseline.json` (per-file ratchet).
- **Glossary** — Defines: Mutant, Killed, Survived, No coverage, Timeout, Mutation score, `break` threshold, Baseline/ratchet, Nightly, Concurrency, `coverageAnalysis: perTest`, Static mutant, Incremental.
- **Worked example** — Five concrete mutants generated from one line in `src/modules/cart/repository.ts`, each with a plain-English question it poses.
- **Thresholds & ratchet** — Explains that the per-file baseline (`mutation-baseline.json`) is the operative daily gate (`npm run test:mutation:check`); `break` is a global backstop.
- **Operational tuning** — Notes that concurrency is memory-bound (each mutant spawns its own in-memory mongod), that `coverageAnalysis: perTest` is the main speedup, that static mutants (module-scope code) are the largest cost, and that incremental mode is enabled with the nightly passing `--force`.

## Relationships

- **docs/tools/testing-and-docs.md** — Sibling tool page in the same `tools/` directory; this page is one of several testing-tool documents grouped under that overview.
- **docs/tools/unit-testing.md** — The test suite that mutation testing *runs against*; a surviving mutant implies a gap in unit assertions.
- **docs/tools/property-testing.md / fuzz-testing.md / concurrency-testing.md** — Other testing-tool pages in the same directory; mutation testing complements them by verifying that the combined suite actually asserts on behaviour.
- **docs/reference/scripts.md** — Documents the npm scripts referenced here (`test:mutation:check`, `test:unit:coverage`) and the nightly GitHub Actions workflow.
- **docs/reference/tests.md** — Covers the Jest configuration (`coverageThreshold`) that the four-numbers table contrasts against Stryker's thresholds.
- **docs/tools/package-scripts.md** — Context for how `stryker.config.json`, `mutation-baseline.json`, and the related npm scripts are wired into the repo's toolchain.
- **docs/reference/ops.md** — Operational notes on the nightly cron (03:00 UTC) run and CI gating behaviour described here.

## Notes

- The page is deliberately opinionated: "survived" is framed as *the finding*, not a neutral outcome. Treat any "survived" mutant as a concrete assertion gap, not a suggestion.
- `stryker.config.json` `high`/`low` thresholds (80/60) are **cosmetic only** — they colour the HTML report but never fail a run. The only enforced gates are `break: 60` and the per-file ratchet.
- Concurrency is capped by **memory**, not CPU: each parallel mutant spawns a full Jest process plus an in-memory MongoDB. Raising the concurrency number without checking available RAM will OOM the runner.
- Static mutants (code that executes at `import` time — e.g. a `new Schema({...})` or a repository built at module scope) bypass `perTest` analysis and are the dominant cost in this repo. The page flags them as the single biggest reason a run takes longer than expected.
- The incremental cache is a **committed file**; the nightly build passes `--force` to discard it and rebuild from scratch, so local and nightly results can diverge if the cache is stale.
