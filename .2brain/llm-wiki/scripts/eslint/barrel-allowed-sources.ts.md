---
source: scripts/eslint/barrel-allowed-sources.ts
sha256: c11a4c0b9d0ccbefa76b909d105e211131534b4421b3479c92267d0282bcaf4c
generated_at: 2026-11-08T02:50:08.051262+00:00
model: ollama:qwen3.8:27b
---

# scripts/eslint/barrel-allowed-sources.ts

## Purpose

Custom ESLint rule that enforces the DDD barrel-publishing contract (`docs/theory/strategic-ddd.md §5`): a module's `index.ts` may only re-export services, domain rules, events, and emails **as values**, and model + presenter(s) **as types only**. It blocks leaking repositories, wiring files, mongoose runtime values, and presenter functions in any export form (`export *`, `export { x } from`, or `import…export` relay).

## Key elements

- **`barrelAllowedSources`** (exported) — the ESLint rule, created via `RuleCreator.withoutDocs`. No options; 7 message IDs (`notAllowed`, `modelAsValue`, `modelNamedValue`, `presenterAsValue`, `presenterNamedValue`, `repositoryExport`, `wiringExport`).
- **`VALUE_SOURCES`** — `Set` of stems allowed as value exports: `services`, `service`, `domain`, `events`, `emails`.
- **`PRESENTER_SOURCES`** — `Set` of `presenter` / `presenters`.
- **`TYPE_SOURCES`** — `VALUE_SOURCES` ∪ `model` ∪ `PRESENTER_SOURCES`; the universe of stems permitted under `export type *`.
- **`MODULE_BARREL_PATH`** — regex that matches `src/modules/<name>/index.ts` (absolute or bare-relative) to scope the rule and identify the module name.
- **`isRepositorySource(stem)`** — flags `repository`.
- **`isWiringSource(stem)`** — flags `routes`, `module`, `probes`, `metrics`, `analytics`, `audit`, `controllers`, `controllers/*`.
- **`isModelRuntimeValueName(name)`** — returns true for names matching `<x>Schema` (non-Zod), `apply*Transform`, or `<x>Model`; the three shapes a named pick from `./model` must not carry.
- **`sourceStem(specifier)`** — strips `./` and `/index` to reduce a specifier to its bare stem.
- **`reportSource`** (inner) — reports and returns `true` if the stem is a repository or wiring file.
- **`reportModelNamedValuePicks`** (inner) — iterates specifiers of a named `./model` export and reports any that match `isModelRuntimeValueName`.
- **`Program` visitor** — builds an `importSourceOf` map (local name → stem) for the `import…export` relay pattern.
- **`ExportAllDeclaration` / `ExportNamedDeclaration` visitors** — the core checking logic for `export *`, `export type *`, and `export { x } from './y'`.

## Relationships

- **`scripts/eslint/index.ts`** — imports and registers `barrelAllowedSources` into the ESLint flat config; the rule is scoped to files matching the module-barrel path.
- **`tests/unit/scripts/eslint/barrel-allowed-sources.test.ts`** — unit-tests the rule with `RuleTester`, covering each message ID and the products-only `tax`/`config` exception.

## Notes

- **Products exception:** only the `products` module barrel may name-pick from `./tax` (VAT lookup) or `./config` (`productPagePath`). The module name is extracted from `context.filename` via `MODULE_BARREL_PATH`; all other modules are rejected for those stems.
- **`factories` is never allowed**, but this rule does not special-case it — `no-restricted-imports` in `eslint.config.ts` blocks the import categorically upstream.
- **Zod schemas are exempt** from `isModelRuntimeValueName`: any name starting with `zod` (case-insensitive) followed by `Schema` is treated as a validation schema, not a mongoose runtime value.
- **`import { x } from './y'; export { x };`** carries no source on the export node, so the rule resolves the stem through the `importSourceOf` map built during the `Program` pass.
- **`MODULE_BARREL_PATH`** uses `(?:^|[/\\])` so it matches both absolute paths (CI) and bare relative filenames that `RuleTester` supplies in tests.
- The file's header comment says "five messages" but the `MessageIds` type and `messages` object define **seven**.
