---
source: scripts/contracts/generate-shared-rule-schemas.ts
sha256: 46491c9823fc857b5e1fba7a6e6485092ae1104b8f0621f91f05ee6e203c7c67
generated_at: 2026-11-14T17:26:13.087727+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/generate-shared-rule-schemas.ts

## Purpose

One-shot regeneration script (run via `npm run regenerate`) that derives two artifact families from the shared-rules YAML files: JSON Schema exports (for the PHP twin, which has no Zod) and committed `as const` TypeScript data files (for union types, plain numbers, and module-level data blocks). Supports a `--check` mode that reports staleness without rewriting.

## Key elements

- **`SCHEMA_EXPORTS`** — flat array of `[folder, name, zodSchema]` tuples covering every rules file whose schema must be exported as JSON. Includes entries outside the registry (personas, roles) due to layering constraints.
- **`writeSchemas()`** — iterates `SCHEMA_EXPORTS`, serializes each Zod schema with `z.toJSONSchema`, and writes/`check`s the `.generated.schema.json` file under `shared/<folder>/schemas/`.
- **`MODULE_BLOCKS`** — table describing the data blocks a module's `module.yaml` may carry (`rateLimits`, `jobs`), each mapped to a schema, output filename, export name, and docblock.
- **`collectBlockSources(block)`** — discovers every module whose `module.yaml` contains the given block key and builds a `GeneratedSource` for it (validated with `z.looseObject`).
- **`collectSources()`** — assembles the full list of TypeScript-generation sources: registry entries with a `generate` spec, each module's `rules.yaml` (via dynamic import of its `rules.schema.ts`), the step-up source, and all module blocks.
- **`loadModuleSource(moduleName)`** — dynamic-imports `src/modules/<name>/rules.schema.ts` and returns the `GeneratedSource`.
- **`writeGenerated(entry)`** — parses the YAML, validates against the entry's Zod schema, renders TS via `renderGenerated`, formats with repo config, and writes/`check`s the output file.
- **`camelCaseOf(name)`** — kebab-case → camelCase for export naming.
- **`STEP_UP_SOURCE`** — hardcoded `GeneratedSource` for the step-up windows in `shared/authorization-keys.generated.yaml`, written to `src/kernel/step-up.generated.ts`.
- **Entry point** — calls `writeSchemas()` synchronously, then `collectSources().then(writeGenerated for each)`, with `failScript` as the error handler.

## Relationships

- **`scripts/contracts/generated-file.ts`** — provides `writeOrCheck`, the unified write-or-check file I/O used for both schema and TS outputs.
- **`scripts/contracts/shared-rules-render.ts`** — provides `renderGenerated`, which turns a validated document + `GenerateSpec` into the TypeScript source text.
- **`scripts/modules-on-disk.ts`** — provides `REPO_ROOT`, `MODULES_ROOT`, and `modulesWith` for filesystem discovery of modules.
- **`scripts/fail-script.ts`** — provides `failScript`, the terminal error handler on failure.
- **`scripts/scaffold/format-text.ts`** — provides `formatWithRepoConfig` for repo-aware code formatting before writing.
- **`src/infrastructure/config/shared-rules/registry.ts`** — source of `SHARED_RULES`, the canonical list of shared rules files (schema + optional generate spec).
- **`src/infrastructure/config/shared-rules/generate-spec.ts`** — source of the `GenerateSpec` type that describes how a rules file maps to generated TS.
- **`src/infrastructure/config/shared-rules/jobs.ts`** — provides `jobsBlockSchema` used to validate the `jobs:` block in module YAMLs.
- **`src/infrastructure/config/shared-rules/rate-limits.ts`** — provides `rateLimitsBlockSchema` used to validate the `rateLimits:` block in module YAMLs.
- **`src/infrastructure/config/shared-rules/step-up.ts`** — provides `stepUpDocumentSchema` for the step-up windows source.
- **`src/kernel/permissions.ts`** — provides `rolesDocumentSchema` (the authorization-roles file's schema), listed here because the kernel loads it at boot.
- **`scenarios/personas-schema.ts`** — provides `personasSchema`; listed here (not in the registry) because infrastructure must not import from `scenarios/`.

## Notes

- Module-block validation uses `z.looseObject({ [block.key]: block.schema })` — only the relevant key is checked; the rest of `module.yaml` is left to `module-descriptor.ts`.
- The registry (`SHARED_RULES`) is the single source for `shared/rules/*.yaml`, but three schemas are deliberately **outside** the registry (personas, roles, step-up) to respect import-direction rules.
- Module discovery is by filesystem scan (`modulesWith`), not by a central list — adding a module requires no edit to this file.
- The script runs under `tsx` (shebang on line 1); no build step is involved.
- `--check` mode is delegated entirely to `writeOrCheck`; this file has no flag-parsing logic of its own.
