---
source: scripts/docs/module-descriptor.ts
sha256: 3aca249558309701e7e6c986e61b684fbe50a68277f03ee352c67d7c2695ebc9
generated_at: 2026-11-08T02:49:36.900397+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/module-descriptor.ts

## Purpose

Single typed reader for every module's `module.yaml`. It exists so that the docs generator, cross-cutting tests, and any other consumer share one Zod-validated parse path rather than each hand-rolling their own YAML reading—eliminating drift when a new field is added.

## Key elements

- **`moduleDescriptorSchema`** — Zod strict schema for a `module.yaml`. Fields: `summary`, `subdomain` (core / supporting / generic), `group` (foundation / shop / example), `dependsOn`, and optional `noAudit`, `rateLimits`, `jobs`.
- **`ModuleDescriptor`** — TypeScript type inferred from the schema.
- **`readModuleDescriptor(descriptorPath)`** — Reads, YAML-parses, and schema-validates a single `module.yaml`; throws on mismatch.
- **`readAllModuleDescriptors(modulesRoot)`** — Discovers every folder under `modulesRoot` that contains a `module.yaml` (via `modulesWith`), reads each, and returns a `Record<folderName, ModuleDescriptor>`.

## Relationships

- **`scripts/modules-on-disk.ts`** — Provides `modulesWith`, the directory-scanning helper used by `readAllModuleDescriptors`.
- **`src/infrastructure/config/shared-rules/jobs.ts`** — Exports `jobsBlockSchema`, composed into the descriptor's `jobs` field.
- **`src/infrastructure/config/shared-rules/rate-limits.ts`** — Exports `rateLimitsBlockSchema`, composed into the descriptor's `rateLimits` field.
- **`scripts/docs/generate-module-graph.ts`** — Consumer: reads descriptors to colour the module graph (per the file's module doc-comment).
- **`tests/cross-cutting/audit-actions.test.ts`** — Reads the `noAudit` field to confirm modules that opt out are accounted for.
- **`tests/unit/scripts/docs/module-descriptor.test.ts`** — Unit tests for the schema and readers in this file.

## Notes

- The schema is `.strict()`: any extra key in a `module.yaml` is a hard parse error. This is deliberate—extra keys signal a typo or misunderstanding of the file's contract.
- `noAudit` is optional but mutually exclusive with having an `audit.ts` in the module; the audit test enforces the inverse (a module *with* an `audit.ts` must not carry `noAudit`).
- `rateLimits` and `jobs` are stored **as data in YAML**; the corresponding `<module>/rate-limits.generated.ts` and `<module>/jobs.generated.ts` are produced by `npm run regenerate`. Editing the YAML is the source of truth; the `.ts` files are build artifacts.
- `group` is not merely descriptive—`.dependency-cruiser.cjs` rules (`foundation-cannot-reach-shop`, `nothing-reaches-example`) read it and fail the build if violated (fail-closed enforcement).
- Adding a new module means editing its own folder's `module.yaml` and `src/modules.ts`; no hand-maintained table elsewhere needs updating.
