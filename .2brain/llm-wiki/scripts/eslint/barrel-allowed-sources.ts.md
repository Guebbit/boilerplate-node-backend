---
source: scripts/eslint/barrel-allowed-sources.ts
sha256: c11a4c0b9d0ccbefa76b909d105e211131534b4421b3479c92267d0282bcaf4c
generated_at: 2026-10-29T01:36:53.481370+00:00
model: ollama:qwen3.8:27b
---

# scripts/eslint/barrel-allowed-sources.ts

## Purpose

Custom ESLint rule that enforces which files a module's `index.ts` barrel is permitted to re-export. It codifies the strategic-DDD export contract (see `docs/theory/strategic-ddd.md` §5): services, domain, events, and emails may be exported as values; model and presenter(s) may only be exported as types; repositories and wiring files (routes, controllers, probes, metrics, analytics, audit) are never exportable in any form.

## Key elements

- **`barrelAllowedSources`** — The exported ESLint rule (created via `ESLintUtils.RuleCreator.withoutDocs`). Takes no options; reports seven distinct messages.
- **`VALUE_SOURCES`** — `Set` of stems allowed for value exports: `services`, `service`, `domain`, `events`, `emails`.
- **`TYPE_SOURCES`** — `VALUE_SOURCES` plus `model` and presenter stems; the superset allowed for `export type *`.
- **`PRESENTER_SOURCES`** — `presenter`, `presenters`.
- **`isRepositorySource`** / **`isWiringSource`** — Stem-level guards that produce dedicated error messages (`repositoryExport`, `wiringExport`).
- **`isModelRuntimeValueName`** — Name-convention check that flags a named pick from `./model` as a runtime value (mongoose `*Schema`, `apply*Transform`, `*Model`) while carving out Zod schemas.
- **`sourceStem`** — Normalizes a specifier (strips `./` and trailing `/index`) to a comparable stem.
- **`MODULE_BARREL_PATH`** — Regex that captures the module name from the barrel file path; used to grant `products` a special allowance for named picks from `tax` and `config`.
- **`importSourceOf`** (local `Map`) — Tracks `import { x } from './y'` pairs so the re-export form `export { x }` (which carries no source) can still be validated.
- **AST visitors**: `Program` (builds import map), `ExportAllDeclaration`, `ExportNamedDeclaration` — the three node types that can produce a barrel re-export.

## Relationships

- **`scripts/eslint/index.ts`** — Aggregates/exports this rule so `eslint.config.ts` can register it against module barrel files.
- **`tests/unit/scripts/eslint/barrel-allowed-sources.test.ts`** — Unit-test harness exercising each message ID and edge case (products exception, re-export form, Zod carve-out, etc.).
- **`eslint.config.ts`** (referenced in comments) — Applies this rule only to `src/modules/*/index.ts` paths; also enforces `no-restricted-imports` for `factories`, so this rule does not need its own factories exception.
- **`docs/theory/strategic-ddd.md` §5** — The architectural rationale cited in every error message.

## Notes

- The rule is **only active on module barrels** (`src/modules/<name>/index.ts`); it does nothing on other files. The path regex uses `(?:^|[/\\])` so it matches both absolute and bare-relative filenames (the latter appears in test `RuleTester` runs).
- **Products module special case**: a named pick from `./tax` or `./config` is permitted *only* in `products/index.ts`. The check is keyed off the captured module name from the filename, not off the file's own contents.
- **`factories` is intentionally absent** from both allowlists and has no dedicated exception: a separate `no-restricted-imports` rule already blocks the import outright, so adding a carve-out here would be dead code.
- **Presenter named picks are uniformly rejected** (any non-type `export { x } from './presenter'`), unlike model named picks which are allowed for pure helpers. The reasoning: a presenter has no "type worth naming individually" beyond what `export type *` already covers.
- `isModelRuntimeValueName` relies on **repo naming conventions** (`<name>Schema`, `apply<Name>Transform`, `<name>Model`). A Zod validation schema is exempted by requiring the `zod` prefix (case-insensitive).
