# stryker.config.json

## Purpose

Stryker mutation-testing configuration for the backend. It defines which source files are mutated, which test files may (and may not) run against the mutants, how results are thresholded, and how incremental caching is handled. The file's primary value is the extensive `_comment` array, which records *why* every scope, exclusion, and threshold decision was made and links out to `docs/tools/mutation-testing.md` for the full glossary and diagrams.

## Key elements

- **`$schema`** – Points to the local `@stryker-mutator/core` JSON schema for editor validation.
- **`_comment`** – A multi-paragraph array documenting: the origin of every number, the incremental-cache design, the scope/exclusion rationale, threshold philosophy, and the standing signal that `src/app/**` has no unit tests.
- **`mutate`** – Scope of files Stryker will mutate: `infrastructure/`, `kernel/`, and every module's model, repository, service, routes, and supporting files. Barrel `index.ts` files, `module.ts`, `demo.ts`, `src/app/**`, and test directories are excluded.
- **`testPathIgnorePatterns`** – **Regexes** (not globs) for test files excluded from the mutation run: contract suites (two locations), per-module integration suites, `outbox-names.test.ts`, and `contract-bundles.test.ts`.
- **`ignorePatterns`** – Filesystem paths Stryker must not copy into its sandbox (`.tmp/**`, `.stryker-tmp*/`). Must **not** include `public/**`.
- **`incremental`** – Stores per-mutant verdicts in `reports/stryker-incremental.json` (committed) so unchanged code+tests skip re-testing. Nightly runs pass `--force` to bypass the cache.
- **Thresholds (`high` / `low` / `break`)** – `high`/`low` only colour the report. `break: 60` is the sole failing gate and is a deliberate floor (currently below the observed band); the real per-file gate lives in `mutation-baseline.json`.
- **`disableTypeChecks`** – Discussed in comments; keeping it on avoids type-breaking mutants being counted as kills without an assertion earning them.

## Relationships

No graph neighbors are recorded for this file. The comments reference several sibling artifacts that interact with it at runtime or in CI:

- **`mutation-baseline.json`** – The per-file gate; `npm run test:mutation:check` (the PR-time check) compares the last report against this file without running mutants.
- **`.github/workflows/mutation.yml`** – Nightly and on-demand mutation runs that execute the suite once per mutant.
- **`run-mutation-tests.ts`** – Clears `.tmp/` before starting; the source of a race condition with `ignorePatterns`.
- **`.gitignore`** – Contains a negation for `reports/stryker-incremental.json` (must be `reports/*` + negation, not `reports/` + negation, because git does not descend into an excluded directory).
- **`docs/tools/mutation-testing.md`** – Full explanation, glossary, and diagrams referenced by the comments.
- **Frontend `stryker.config.json`** – Written as a pair; the `break: 60` floor and the "exclude what the tool cannot measure" philosophy are mirrored.

## Notes

- `testPathIgnorePatterns` entries are **regexes**, not globs. `[^/]+` is the module-name segment; a mistake here silently skips (or includes) wrong test files.
- `ignorePatterns` must **not** list `public/**` — the sandbox is the only filesystem tests see, and `tests/unit/db/seed-fixtures.test.ts` asserts seed fixture image URLs resolve to committed files under `public/images/seed/`. Omitting `public/` causes Stryker to refuse to start.
- The incremental cache file **must be committed**. An ignored file makes the optimisation local-only and invisible to CI.
- A stale cache (refactor moving code between files, bad merge resolution) is mitigated by the nightly `--force` flag; ad-hoc local runs reuse the cache.
- `break: 60` is **below** the current observed band (~28.66 % total / 51.57 % covered). Every run will fail until real unit coverage closes the gap. This is intentional, not a misconfiguration.
- `src/app/**` is excluded because it is exercised only by integration/contract suites that are themselves excluded from the mutation runner. The exclusion is a standing reminder: **the Express wiring has no unit tests.** If a unit-test suite for `src/app/**` is added, it should be re-included in `mutate`.
- `contract-bundles.test.ts` is excluded because Stryker prepends `// @ts-nocheck` in the sandbox, making byte-identical assertions against committed bundles impossible. Excluding it costs no coverage (it exercises files outside `mutate`).
- `outbox-names.test.ts` is excluded because Stryker rewrites string literals in sandboxed source, breaking a regex that matches `template: '...'` as a plain literal.
