---
source: scripts/eslint/barrel-allowed-sources.ts
sha256: 4615ee75e053f16b1f691e54724052b42f801b5222ef6be1ceb7b503e46d7f8a
generated_at: 2026-09-23T17:26:36.604292+00:00
model: ollama:qwen3.8:27b
---

# scripts/eslint/barrel-allowed-sources.ts

## Purpose

A custom ESLint rule that enforces Strategic DDD boundaries on module barrel files (`src/modules/<name>/index.ts`). It restricts what a barrel may re-export: only services, domain rules, events, and emails as values; the model as types only; and wiring/repository files never. This prevents a module from leaking its internal implementation surface (routes, controllers, repositories, Mongoose runtime objects) to consumers.

## Key elements

- **`barrelAllowedSources`** (default export) — The ESLint rule created via `ESLintUtils.RuleCreator.withoutDocs`. Takes no options; reports five message IDs (`notAllowed`, `modelAsValue`, `modelNamedValue`, `repositoryExport`, `wiringExport`).
- **`VALUE_SOURCES`** — `Set` of stems a barrel may `export *` or name-pick as values: `services`, `service`, `domain`, `events`, `emails`.
- **`TYPE_SOURCES`** — `VALUE_SOURCES` plus `model`; the allowlist when `exportKind === 'type'`.
- **`MODULE_BARREL_PATH`** — Regex (`/(?:^|[/\\])src[/\\]modules[/\\]([^/\\]+)[/\\]index\.ts$/`) that identifies the barrel file and captures the module name (used for the `products`-only `tax` exception).
- **`isModelRuntimeValueName`** — Matches names that read as Mongoose runtime values (`*Schema` except `zod*`, `apply*Transform`, `*Model`) so a named pick from `./model` is flagged individually.
- **`isRepositorySource` / `isWiringSource`** — Stem checks for the two "never allowed" categories (repository; routes, module, probes, metrics, analytics, audit, controllers).
- **`sourceStem`** — Normalises a specifier (`'./services/index'` → `'services'`, `'./model'` → `'model'`).
- **`importSourceOf`** (local map in `create`) — Maps local import names to their source stem, enabling the `import { x } from './y'; export { x };` re-export form to be checked.

## Relationships

- **`scripts/eslint/index.ts`** — Registers and re-exports `barrelAllowedSources` so it is available to `eslint.config.ts`.
- **`tests/unit/scripts/eslint/barrel-allowed-sources.test.ts`** — Unit-tests the rule's five report paths and the `products`/`tax` exception using the `RuleTester` utility.

## Notes

- The rule only activates on files matching `src/modules/<name>/index.ts` (enforced at registration in `eslint.config.ts`, not inside the rule itself).
- `factories` is deliberately absent from the allowlists _and_ from the code: `no-restricted-imports` in `eslint.config.ts` already blocks importing it, so this rule has no allowance or check for it.
- The `tax` named-pick exception applies **only** to the `products` barrel; the module name is extracted from the file path at runtime.
- Zod validation schemas (`zod*Schema`) are explicitly excluded from `isModelRuntimeValueName` so they are not false-positived as Mongoose runtime values.
- Three export forms are handled: `export * from`, `export { x } from`, and `import … ; export { x };` (the last resolved via the local `importSourceOf` map since the export node carries no `source`).
