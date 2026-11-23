---
source: scripts/contracts/generate-shared-rule-schemas.ts
source_sha256: 8360003078ef9ee881f517f458b71d68d55dec8fbda2ea2fdb0dcadb83f112a4
context_sha256: f9f8917e66790b93777e152ec99cbb308d15adaf47ee7b707e1ff1a53ac97cf3
generated_at: 2026-11-22T01:57:28.268676+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/contracts/generate-shared-rule-schemas.ts

## Purpose
A `tsx` script run by `npm run regenerate`. It derives two kinds of artifacts from the shared rules files: JSON Schema exports of each rules file's Zod schema (so the PHP twin, which has no Zod, can validate with any JSON Schema library), and `*.generated.ts` files holding `as const` TypeScript data so code imports the values instead of reading YAML. With `--check`, it reports stale files instead of rewriting them.

## Key elements
- `SHARED_DIRECTORY`: `<repo>/shared`, where the JSON Schemas are committed.
- `SCHEMA_EXPORTS`: list of `[folder, name, schema]` tuples. It holds every `SHARED_RULES` entry under `rules`, plus `authorization-roles` (`rolesDocumentSchema`) and `personas` (`personasSchema`, under `scenarios`).
- `writeSchemas()`: converts each schema with Zod 4's `z.toJSONSchema` and writes `shared/<folder>/schemas/<name>.generated.schema.json` via `writeOrCheck`.
- `GeneratedSource`: `{ source, schema, spec }`. It describes one YAML file to validate and the `GenerateSpec` that says what TypeScript to write.
- `loadModuleSource(moduleName)`: dynamically imports `src/modules/<m>/rules.schema.ts` and reads its `rulesSchema` and `rulesGenerate` exports.
- `camelCaseOf`: turns a kebab-case folder name into camelCase.
- `ModuleBlock` / `MODULE_BLOCKS`: a table of data blocks that `module.yaml` may carry. The two rows are `rateLimits` (written into each module's folder, export `<camel>RateLimitData`) and `jobs` (written into each module's folder, export `<camel>JobData`). Adding a block means adding one row.
- `collectBlockSources(block)`: for each module that has a `module.yaml` containing `block.key`, builds a source. It uses a loose object schema and a `verbatim` export of that field.
- `STEP_UP_SOURCE`: reads `shared/authorization-keys.generated.yaml` and generates a kernel-side TypeScript file exporting `stepUpWindowData` (from the `stepUp` field).
- `collectSources()`: assembles all sources in this order: registry entries that define `generate`, module `rules.yaml` sources, `STEP_UP_SOURCE`, then module blocks.
- `writeGenerated(entry)`: parses the YAML, validates it with the entry's schema, renders it with `renderGenerated`, formats the result with the repo's formatter config, and calls `writeOrCheck`.

The module's top level runs `writeSchemas()`, then writes all generated sources in parallel, and routes errors to `failScript`.

## Relationships
- `src/infrastructure/config/shared-rules/registry.ts`: `SHARED_RULES` supplies the schemas and optional `generate` specs.
- `generate-spec.ts`: provides the `GenerateSpec` type.
- `jobs.ts`, `rate-limits.ts`, `step-up.ts`: provide `jobsBlockSchema`, `rateLimitsBlockSchema` and `stepUpDocumentSchema`.
- `src/kernel/permissions.ts` (`rolesDocumentSchema`) and `scenarios/personas-schema.ts` (`personasSchema`): schemas that cannot live in the registry.
- `scripts/modules-on-disk.ts`: supplies `MODULES_ROOT`, `REPO_ROOT` and `modulesWith` to discover modules.
- `scripts/contracts/generated-file.ts`: `writeOrCheck` writes the file, or compares it in check mode.
- `scripts/contracts/shared-rules-render.ts`: `renderGenerated` produces the TypeScript text.
- `scripts/scaffold/format-text.ts`: `formatWithRepoConfig` formats the output.
- `scripts/fail-script.ts`: `failScript` is the error handler.

## Notes
- The demo personas schema lives in `scenarios/`, and the roles schema in the kernel, because infrastructure must not import them. That is why they are listed here instead of in the registry.
- Step-up windows live in the permission keys document, not in `shared/rules/<name>.yaml`, so they are listed separately.
- Module `module.yaml` block schemas are wrapped in `z.looseObject`, so the rest of the descriptor is left to `module-descriptor.ts`.
- `writeSchemas()` runs synchronously before the async TypeScript generation.
- Generated paths and the `npm run regenerate` hint are passed to `writeOrCheck` for stale-file reporting.
