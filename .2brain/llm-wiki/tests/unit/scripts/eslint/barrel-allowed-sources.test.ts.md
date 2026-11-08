---
source: tests/unit/scripts/eslint/barrel-allowed-sources.test.ts
sha256: 5b6de604b21d16e481aa48850e7084ea3182a06101216360bf2266fa89177321
generated_at: 2026-11-08T10:36:26.870302+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/eslint/barrel-allowed-sources.test.ts

## Purpose
Unit tests for the `barrelAllowedSources` ESLint rule. The rule enforces that barrel files (`index.ts`) do not re-export repository, wiring, or presenter *values*—only types may leave those sources. The tests cover every branch the rule guards (star export, named export, model-name heuristic, source-less re-export, path-scoped allowance) with one valid and one invalid case per branch rather than a shared case table, because each path independently prevents a different leak scenario.

## Key elements
- **`tester`** — `eslint.RuleTester` instance configured with `@typescript-eslint/parser` (required because `export type *` is TypeScript-only syntax the default espree parser cannot handle), `ecmaVersion: 'latest'`, and `sourceType: 'module'`.
- **`valid` cases** — Five entries confirming what the rule *allows*: `export type *` from `./model`, `./presenter`, `./presenters`; a named pick from `./tax` or `./config` but *only* when the linted file is `src/modules/products/index.ts`.
- **`invalid` cases** — Ten entries, each asserting a specific `messageId`:
  - `modelAsValue` — bare `export * from './model'`
  - `repositoryExport` — star or named re-export of a repository (including the source-less `import … ; export { name }` form)
  - `wiringExport` — even a type-only star from a wiring file (e.g. `./routes`)
  - `modelNamedValue` — a named pick from `./model` whose name matches a schema/model convention (e.g. `userSchema`)
  - `notAllowed` — the same `./tax` pick from a *different* module's barrel (scope check)
  - `presenterAsValue` / `presenterNamedValue` — star or named value re-exports from a presenter (including source-less form)

## Relationships
- **`scripts/eslint/barrel-allowed-sources.ts`** — The rule under test. This file imports `barrelAllowedSources` and feeds it synthetic source strings via `RuleTester`. The rule's import map (used to resolve source-less `export { x }` statements back to their original `import … from '…'`) is exercised implicitly by two invalid cases that omit `from`.

## Notes
- The TypeScript parser is **not optional**: removing it makes `export type *` cases fail to parse, silently skipping several branches.
- The `tax` / `config` allowance is **path-scoped**: the rule reads the file path being linted (`filename` option on each test case) to grant the exception only to `src/modules/products/index.ts`. A sibling module with an identically-named `./tax` file gets the generic `notAllowed` error.
- The header comment cross-references `comment-links.test.ts` for the repository-wide convention that each rule test carries exactly one known-bad input per CHECK rather than a shared table—this keeps the "why" local to each case.
- `as never` cast on the rule in `tester.run` silences a type mismatch between `RuleTester`'s expected rule shape and the actual rule object; it is a test-harness artifact, not a runtime concern.
