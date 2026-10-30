---
source: scripts/contracts/generate-shared-rule-schemas.ts
sha256: a7cbeac401f58465979698c152cb66d6fa45b4bed2d6ba5333feeba1d5ec3ade
generated_at: 2026-10-29T01:31:05.184721+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/generate-shared-rule-schemas.ts

## Purpose

One-shot code generator that derives every committed artifact from the shared-rules YAML files: JSON Schema files (consumed by the PHP twin) and TypeScript `as const` data modules (for typed unions, numeric constants, and per-module data blocks). Supports `--check` to report staleness without rewriting.

## Key elements

- **`SCHEMA_EXPORTS`** — flat list of `[folder, name, schema]` tuples (registry entries + `personasSchema`) that drives all JSON Schema output.
- **`writeSchemas()`** — serialises each Zod schema via `z.toJSONSchema` and writes `shared/<folder>/schemas/<name>.schema.json`.
- **`MODULE_BLOCKS`** — table describing data blocks (`rateLimits`, `jobs`) that may appear in a module's `module.yaml`; adding a new block type is one row.
- **`collectBlockSources(block)`** — scans all modules' `module.yaml` for a given block key and builds a `GeneratedSource` for each hit.
- **`loadModuleSource(moduleName)`** — dynamically imports `rules.schema.ts` from a module folder to obtain its Zod schema and `GenerateSpec`.
- **`collectSources()`** — assembles the full list of TypeScript generation targets: registry entries with a `generate` spec, module-owned rules, `STEP_UP_SOURCE`, and all module-block sources.
- **`STEP_UP_SOURCE`** — static entry that generates `src/kernel/step-up.generated.ts` from `shared/authorization-keys.yaml`.
- **`writeGenerated(entry)`** — parses the YAML, validates it against its Zod schema, renders TS via `renderGenerated`, formats, then writes or checks.
- **`camelCaseOf(name)`** — converts a kebab-case module folder name to camelCase for export naming.

## Relationships

- **`scripts/contracts/generated-file.ts`** — provides `writeOrCheck`, the write-or-report-stale primitive used for every output file.
- **`scripts/contracts/shared-rules-render.ts`** — provides `renderGenerated`, which turns a parsed document + spec into the TypeScript source text.
- **`scripts/fail-script.ts`** — provides `failScript` as the top-level rejection handler.
- **`scripts/modules-on-disk.ts`** — provides `MODULES_ROOT`, `REPO_ROOT`, and `modulesWith` for discovering which modules exist on disk.
- **`scripts/scaffold/format-text.ts`** — provides `formatWithRepoConfig` to format generated code with the repo's Prettier/ESLint config.
- **`src/infrastructure/config/shared-rules/registry.ts`** — exports `SHARED_RULES`, the canonical map of shared-rule schemas (and optional `generate` specs).
- **`src/infrastructure/config/shared-rules/generate-spec.ts`** — exports the `GenerateSpec` type that describes where and how to write a generated file.
- **`src/infrastructure/config/shared-rules/jobs.ts`** — exports `jobsBlockSchema`, the Zod schema for the `jobs:` block in `module.yaml`.
- **`src/infrastructure/config/shared-rules/rate-limits.ts`** — exports `rateLimitsBlockSchema`, the Zod schema for the `rateLimits:` block.
- **`src/infrastructure/config/shared-rules/step-up.ts`** — exports `stepUpDocumentSchema` for validating the step-up section of `authorization-keys.yaml`.
- **`scenarios/personas-schema.ts`** — exports `personasSchema`, listed here rather than in the registry to avoid an infrastructure→scenarios import.

## Notes

- **Personas and step-up are listed inline, not in the registry**, because the registry is scoped to `shared/rules/<name>.yaml` and the personas schema lives in `scenarios/` (importing it into infrastructure is disallowed). Step-up lives in `shared/authorization-keys.yaml`, outside the registry's path convention.
- **Module blocks are discovered at runtime** by reading every `module.yaml`; there is no central list of which modules carry `rateLimits` or `jobs`. The `MODULE_BLOCKS` table is the single extension point for adding a new block type.
- **`--check` mode** is handled entirely by `writeOrCheck`; this script itself carries no flag-parsing logic.
- **Validation is strict**: `entry.schema.parse(parsed)` will throw on the first mismatch, and the error message includes the YAML line number (via `yaml`'s parser).
- The script runs synchronously for schemas (`writeSchemas`) then asynchronously for TypeScript (`collectSources` → `writeGenerated`), both under a single `catch(failScript)`.
