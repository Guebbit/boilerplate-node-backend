---
source: scripts/eslint/barrel-allowed-sources.ts
sha256: 3aeace558f01dc123e44e9711f3dae8b0afc2d56507dc3141fd61836994dc798
generated_at: 2026-10-14T07:17:53.406340+00:00
model: ollama:qwen3.8:27b
---

# scripts/eslint/barrel-allowed-sources.ts

## Purpose

A custom ESLint rule that enforces which files a module's barrel (`src/modules/<name>/index.ts`) is permitted to re-export, codifying the public-surface contract from `docs/theory/strategic-ddd.md` §5. It restricts barrels to publishing services, domain, events, and emails as values; model and presenter(s) as types only; and rejects repositories, wiring files, and runtime model/presenter exports in any form.

## Key elements

- **`barrelAllowedSources`** (exported) — The ESLint rule created via `RuleCreator.withoutDocs`. No options; seven message IDs (`notAllowed`, `modelAsValue`, `modelNamedValue`, `presenterAsValue`, `presenterNamedValue`, `repositoryExport`, `wiringExport`). Visits `ExportAllDeclaration`, `ExportNamedDeclaration`, and `Program` (to build an import-source map for re-exports).
- **`VALUE_SOURCES`** — `Set` of stems a barrel may value-export: `services`, `service`, `domain`, `events`, `emails`.
- **`TYPE_SOURCES`** — Superset of `VALUE_SOURCES` plus `model`, `presenter`, `presenters`; the ceiling for `export type *`.
- **`PRESENTER_SOURCES`** — `Set(['presenter', 'presenters'])`.
- **`isModelRuntimeValueName(name)`** — Returns `true` for names matching the repo's runtime-model conventions (`<name>Schema` excluding `zod*`, `apply*Transform`, `<name>Model`); used to reject individual named picks from `./model`.
- **`isRepositorySource(stem)`** / **`isWiringSource(stem)`** — Categorical rejects for `repository` and for wiring files (`routes`, `module`, `probes`, `metrics`, `analytics`, `audit`, `controllers`).
- **`sourceStem(specifier)`** — Normalises a relative specifier (`./services/index` → `services`) so checks are about the file, not the spelling.
- **`MODULE_BARREL_PATH`** — Regex that captures the module name from the file path; used to detect the `products` barrel (which additionally may name-pick from `tax`).

## Relationships

- **`scripts/eslint/index.ts`** — Re-exports or registers `barrelAllowedSources` so it is available to the ESLint config; the rule is applied only to files matching `src/modules/*/index.ts`.
- **`tests/unit/scripts/eslint/barrel-allowed-sources.test.ts`** — Unit tests that exercise each message path (value exports, type-only exports, model/presenter named picks, repository/wiring rejection, products `tax` exception) via the `RuleTester` pattern.

## Notes

- The rule is intentionally scoped to barrel files only; it does not lint arbitrary `export *` elsewhere in the codebase.
- `factories` is never allowed from any barrel, but the rule does not carry its own check for it — `no-restricted-imports` in `eslint.config.ts` blocks that import categorically, so no allowance or denial logic is needed here.
- The `products` exception for `tax` is determined at runtime by matching `context.filename` against `MODULE_BARREL_PATH`; a test's bare relative `filename` (no leading slash) is handled by the `(?:^|[/\\])` in the regex.
- Named picks from `./model` are checked **by name** (via `isModelRuntimeValueName`), not by blanket rejection — genuinely pure helpers exported from `model.ts` are permitted.
- Named picks from `./presenter(s)` are rejected wholesale when non-type, because the only thing worth publishing is the output type, which `export type *` already covers.
