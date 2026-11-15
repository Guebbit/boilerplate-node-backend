---
source: scripts/docs/module-descriptor.ts
sha256: 02da014db9a05fbf8de2f18327a694adfa83518c13ac45fe04dda3a748e5e1cb
generated_at: 2026-11-14T17:34:21.919671+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/module-descriptor.ts

## Purpose

Single typed reader for a module's `module.yaml` file. It defines one strict Zod schema and two read functions so that every consumer (the module-graph docs generator, cross-cutting well-formedness tests, `npm run regenerate` codegen) shares the same parse-and-validate path instead of each hand-rolling its own YAML interpretation.

## Key elements

- **`moduleDescriptorSchema`** — `z.object({…}).strict()` schema for `module.yaml`. Fields: `summary` (non-empty string), `subdomain` (`core` | `supporting` | `generic`), `group` (`foundation` | `shop` | `example`), `dependsOn` (string array), `rateLimits` (optional, validated by `rateLimitsBlockSchema`), `jobs` (optional, validated by `jobsBlockSchema`).
- **`ModuleDescriptor`** — `z.infer` of the schema; the TypeScript shape returned by both readers.
- **`readModuleDescriptor(descriptorPath: string)`** — Reads one `module.yaml` from disk, parses it as YAML, validates against the schema. Throws on mismatch.
- **`readAllModuleDescriptors(modulesRoot: string)`** — Scans `modulesRoot` via `modulesWith(…, 'module.yaml')`, returns `Record<string, ModuleDescriptor>` keyed by folder name in alphabetical order.

## Relationships

- **`scripts/modules-on-disk.ts`** — Provides `modulesWith`, used by `readAllModuleDescriptors` to enumerate which subfolders carry a descriptor.
- **`src/infrastructure/config/shared-rules/jobs.ts`** — Exports `jobsBlockSchema`, embedded as the `jobs` field schema.
- **`src/infrastructure/config/shared-rules/rate-limits.ts`** — Exports `rateLimitsBlockSchema`, embedded as the `rateLimits` field schema.
- **`tests/unit/scripts/docs/module-descriptor.test.ts`** — Unit tests for the schema and both reader functions.
- **`tests/cross-cutting/module-descriptors.test.ts`** — Validates every real module's descriptor against the schema.

## Notes

- The schema is `.strict()`: any key not listed in the object fails validation. This is intentional — an extra key is treated as a typo or a misuse of the file.
- `group` is not merely documentation: `.dependency-cruiser.cjs` rules (`foundation-cannot-reach-shop`, `nothing-reaches-example`) read it and fail the build if violated.
- Adding a new module requires editing only that module's own `module.yaml` (plus `src/modules.ts`); no hand-maintained index or exemption table needs updating.
- `rateLimits` and `jobs` are optional; a module that defines neither still passes validation.
