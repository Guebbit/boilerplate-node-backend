---
source: scripts/eslint/barrel-allowed-sources.ts
source_sha256: ebe38d8729153294cdffbce6e4809470c2fae2649ec61a7f781894a93ab00551
context_sha256: a650206425d48c28861911aa37d091e3e12aa58ea181d146ea7b0b6ef9cf5305
generated_at: 2026-11-22T02:05:28.811885+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/eslint/barrel-allowed-sources.ts

## Purpose
A custom ESLint rule (`barrelAllowedSources`) that restricts what a module's barrel (`src/modules/<name>/index.ts`) may re-export. A barrel may publish services, domain rules, events and emails as values, and the model and presenter(s) as types only. Repositories, the model's runtime value, presenter functions and wiring files are refused in every export form. It enforces the "published language" rule described in the file's `@see` doc reference (section 5, the barrel).

## Key elements
- `barrelAllowedSources`: the exported rule, built with `ESLintUtils.RuleCreator.withoutDocs`. It takes no options and has the message ids `notAllowed`, `modelAsValue`, `modelNamedValue`, `presenterAsValue`, `presenterNamedValue`, `repositoryExport` and `wiringExport`.
- `VALUE_SOURCES`: `services`, `service`, `domain`, `events`, `emails`. These may be exported as values.
- `PRESENTER_SOURCES`: `presenter`, `presenters`.
- `TYPE_SOURCES`: `VALUE_SOURCES` plus `model` and the presenter sources. These are accepted under `export type *`.
- `isRepositorySource` / `isWiringSource`: flag the `repository` stem, and the wiring stems `routes`, `module`, `probes`, `metrics`, `analytics`, `audit`, `controllers` and `controllers/*`.
- `isModelRuntimeValueName`: a naming heuristic for named picks from `./model`. It flags `*Schema` (except names starting with `zod`), `apply*Transform` and `*Model`.
- `sourceStem`: strips the leading `./` and a trailing `/index`, so `./services/index` and `./services` both give `services`.
- `MODULE_BARREL_PATH`: a regex matching `src/modules/<name>/index.ts` that captures the module name. The leading separator is optional so relative test filenames match.
- `create` visitors:
  - `Program` collects local import names mapped to source stems.
  - `ExportAllDeclaration` handles `export *` and `export type *`.
  - `ExportNamedDeclaration` handles `export { x } from './y'`.
  - The file also covers the `import { x }; export { x }` form by resolving it through the import map. That handling is cut off in the excerpt I was given, so I can't describe it further.

## Relationships
- `scripts/eslint/index.ts`: the neighboring ESLint scripts entry point, which presumably exposes the rule.
- `tests/unit/scripts/eslint/barrel-allowed-sources.test.ts`: the unit test for this rule. The `MODULE_BARREL_PATH` comment says test filenames are bare relative paths.

## Notes
- The `tax` and `config` named-pick exception applies only to the `products` barrel. The module name is read from the file path.
- `export type *` from a repository or wiring source is still reported, because `reportSource` runs before the type-only check.
- A named pick from `./presenter(s)` is reported unless it is a type-only export. A named pick from `./model` is checked by name only when it is not type-only.
- Model checks rely on naming conventions (`<name>Schema`, `apply<Name>Transform`, `<name>Model`). A model runtime value that doesn't follow them would not be caught.
- The `MessageIds` doc comment says "five messages", but seven ids are declared.
