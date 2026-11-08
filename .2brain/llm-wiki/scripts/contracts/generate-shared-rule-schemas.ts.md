---
source: scripts/contracts/generate-shared-rule-schemas.ts
sha256: a7cbeac401f58465979698c152cb66d6fa45b4bed2d6ba5333feeba1d5ec3ade
generated_at: 2026-11-08T02:42:21.276458+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/generate-shared-rule-schemas.ts

## Purpose

One-step regeneration script that derives two artifacts from shared-rules YAML files: (1) JSON Schema files under `shared/<folder>/schemas/` for the PHP side (which has no Zod), and (2) committed `as const` TypeScript files for modules that type unions or plain numbers. It auto-discovers module-owned rules and `module.yaml` data blocks rather than requiring a manual list. Supports a `--check` mode (via `writeOrCheck`) that reports staleness instead of rewriting.

## Key elements

- **`SCHEMA_EXPORTS`** — Flat list of every `[folder, name, schema]` tuple to export as JSON Schema. Combines the shared-rules registry entries plus the personas schema.
- **`writeSchemas()`** — Iterates `SCHEMA_EXPORTS`, serialises each via `z.toJSONSchema` (Zod 4), and writes/checks `shared/<folder>/schemas/<name>.schema.json`.
- **`GeneratedSource`** (interface) — Describes one TypeScript generation task: YAML `source` path, Zod `schema`, and a `GenerateSpec` (output path + export list).
- **`loadModuleSource(moduleName)`** — Dynamically `import()`s a module's `rules.schema.ts` to obtain its `rulesSchema` and `rulesGenerate`, returning a `GeneratedSource`.
- **`MODULE_BLOCKS`** — Declarative table (rateLimits, jobs) mapping a `module.yaml` key to its schema, output filename, export-namer, and description. Adding a new block is one row.
- **`collectBlockSources(block)`** — Scans all modules' `module.yaml` for the block's key; returns a `GeneratedSource` per hit using `z.looseObject` so only the block is validated here.
- **`STEP_UP_SOURCE`** — Hard-coded `GeneratedSource` for step-up windows extracted from `shared/authorization-keys.yaml` (lives outside `shared/rules/`, so it is not in the registry).
- **`collectSources()`** — Assembles the full list: registry entries with a `generate` spec, every module's `rules.yaml`, `STEP_UP_SOURCE`, and all module blocks.
- **`writeGenerated(entry)`** — Reads + parses the YAML, validates against the Zod schema, calls `renderGenerated`, formats with repo Prettier config, then `writeOrCheck`s the result.
- **Top-level execution** — Runs `writeSchemas()`, then `collectSources().then(…writeGenerated each…).catch(failScript)`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `scripts/contracts/generated-file.ts` | Provides `writeOrCheck` (write-or-report-stale) used by both `writeSchemas` and `writeGenerated`. |
| `scripts/contracts/shared-rules-render.ts` | Provides `renderGenerated` which turns a parsed document + spec into the TypeScript source text. |
| `scripts/fail-script.ts` | Provides `failScript` as the top-level error handler. |
| `scripts/modules-on-disk.ts` | Provides `MODULES_ROOT`, `REPO_ROOT`, and `modulesWith` for filesystem discovery of modules. |
| `scripts/scaffold/format-text.ts` | Provides `formatWithRepoConfig` to run generated TS through the repo's Prettier/ESLint config. |
| `src/infrastructure/config/shared-rules/registry.ts` | Source of `SHARED_RULES` — the canonical map of shared rule schemas and optional generate specs. |
| `src/infrastructure/config/shared-rules/generate-spec.ts` | Type-only import of `GenerateSpec` used throughout. |
| `src/infrastructure/config/shared-rules/jobs.ts` | Provides `jobsBlockSchema` for validating the `jobs:` block in `module.yaml`. |
| `src/infrastructure/config/shared-rules/rate-limits.ts` | Provides `rateLimitsBlockSchema` for the `rateLimits:` block. |
| `src/infrastructure/config/shared-rules/step-up.ts` | Provides `stepUpDocumentSchema` for the step-up windows in `authorization-keys.yaml`. |
| `scenarios/personas-schema.ts` | Provides `personasSchema`; listed in `SCHEMA_EXPORTS` (not the registry) because infrastructure must not import from `scenarios/`. |

## Notes

- **Layering constraint:** `personasSchema` is intentionally excluded from `SHARED_RULES` (the infrastructure registry) to keep the infrastructure → scenarios import direction clean. It is appended directly in `SCHEMA_EXPORTS`.
- **Step-up is a one-off:** It reads from `shared/authorization-keys.yaml`, which is not a `shared/rules/<name>.yaml` file, so it cannot live in the registry and is hard-coded as `STEP_UP_SOURCE`.
- **Loose validation for module blocks:** `collectBlockSources` wraps the block schema in `z.looseObject`, so unknown sibling keys in `module.yaml` pass here; full descriptor validation is `module-descriptor.ts`'s responsibility.
- **Dynamic import for module schemas:** `loadModuleSource` uses `import()` on `rules.schema.ts` at runtime, avoiding a static dependency on every module's schema file.
- **`--check` flag:** The script itself does not parse `--check`; that logic lives in `writeOrCheck`, which compares content and exits non-zero on mismatch instead of writing.
