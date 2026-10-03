---
source: scripts/eslint/barrel-allowed-sources.ts
sha256: fbf59f31691c10d111adda08f86d06077a70a0b43384b965083b0fe8bd76953f
generated_at: 2026-10-01T12:31:37.259921+00:00
model: ollama:qwen3.8:27b
---

# scripts/eslint/barrel-allowed-sources.ts

## Purpose

A custom ESLint rule that enforces what a module's barrel file (`src/modules/<name>/index.ts`) is permitted to export. It restricts value exports to services, domain rules, events, and emails; limits model and presenter(s) to type-only re-exports; and categorically blocks repository, wiring, and runtime-value files. The rule operationalises the module-boundary rules described in `docs/theory/strategic-ddd.md` §5.

## Key elements

- **`barrelAllowedSources`** (exported) — The ESLint rule created via `ESLintUtils.RuleCreator.withoutDocs`. No options; seven message IDs (`notAllowed`, `modelAsValue`, `modelNamedValue`, `presenterAsValue`, `presenterNamedValue`, `repositoryExport`, `wiringExport`).
- **`VALUE_SOURCES`** — Set of stems a barrel may `export *` as values: `services`, `service`, `domain`, `events`, `emails`.
- **`PRESENTER_SOURCES`** — `presenter`, `presenters`; reachable but type-only.
- **`TYPE_SOURCES`** — Union of the above plus `model`; the allow-list for `export type *`.
- **`isRepositorySource`** — Matches stem `repository`.
- **`isWiringSource`** — Matches stems `routes`, `module`, `probes`, `metrics`, `analytics`, `audit`, `controllers` (and `controllers/*`).
- **`isModelRuntimeValueName`** — Identifies a named pick from `./model` that is a mongoose schema, its `toJSON` transform, or the model object (excludes Zod schemas named `zod*Schema`).
- **`sourceStem`** — Normalises a relative specifier (`./model`, `./services/index`) to its bare stem.
- **`MODULE_BARREL_PATH`** — Regex that captures the module name from the file path so the rule can special-case the `products` barrel (tax pick).
- **`reportSource`** / **`reportModelNamedValuePicks`** — Internal helpers that emit the appropriate diagnostic for a given node.

## Relationships

- **`scripts/eslint/index.ts`** — Registers this rule in the ESLint configuration (restricted to `index.ts` files under `src/modules/*/`). This file does not import it; the registration is one-directional.
- **`tests/unit/scripts/eslint/barrel-allowed-sources.test.ts`** — Unit-test suite that exercises the rule's visitors against synthetic source strings, covering every message ID.

## Notes

- The rule only lints files matching `src/modules/<name>/index.ts`; it is not a general-purpose import checker.
- The `tax` named-pick exception is scoped to the `products` module alone (detected via the captured module name in the file path). Sibling modules are not granted this carve-out.
- `factories` is deliberately absent from both allow-lists. It is already blocked categorically by a separate `no-restricted-imports` entry in `eslint.config.ts`, so this rule does not duplicate that check.
- The `isModelRuntimeValueName` check relies on this repo's own naming convention (`*Schema`, `apply*Transform`, `*Model`). A future rename of those conventions would silently weaken the rule.
- For `ExportNamedDeclaration` with a source, a non-type `export { x } from './model'` is checked specifier-by-specifier (only offending names are flagged); a non-type named pick from `./presenter` is rejected wholesale because no individual name from that file is considered safe.
