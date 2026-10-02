---
source: scripts/docs/module-descriptor.ts
sha256: b400d2ab8cf7d2787aca097deccfc7dc815cfeae97c0f1690cacaa45dbf22d0f
generated_at: 2026-10-01T12:31:08.420694+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/module-descriptor.ts

## Purpose

Single typed reader and validator for each module's `module.yaml`. It exists so that every consumer (the docs generator, the cross-cutting descriptor test, the shop-name list) shares one Zod schema and one parse function, preventing the drift that arises when a second hand-rolled reader misses a newly added field.

## Key elements

- **`frontendPairingSchema`** — Zod strict object for the optional `frontend` block: `counterparts: string[]` plus an optional `why` sentence.
- **`moduleDescriptorSchema`** — Zod strict object for the full descriptor: `summary`, `subdomain` (core/supporting/generic), `group` (foundation/shop), `dependsOn: string[]`, optional `noAudit` (reason string), optional `frontend`.
- **`ModuleDescriptor`** — `z.infer`-derived TypeScript type of a parsed descriptor.
- **`readModuleDescriptor(descriptorPath)`** — Reads one `module.yaml` off disk, YAML-parses it, validates against the schema; throws on mismatch.
- **`readAllModuleDescriptors(modulesRoot)`** — Scans a directory for sub-folders containing a `module.yaml`, returns a `Record<folderName, ModuleDescriptor>` in alphabetical order.
- **`frontendCounterparts(name, descriptor)`** — Returns the explicit `frontend.counterparts` list, or falls back to `[name]` when the module declares no pairing.

## Relationships

- **`scripts/docs/generate-module-graph.ts`** — Consumes descriptors to colour/navigate the module graph (the file's stated "docs generator that colours the module graph").
- **`scripts/docs/module-catalogue.ts`** — Reads `summary` (and likely `subdomain`/`group`) for the docs index and sidebar.
- **`scripts/testing/shop-module-names.ts`** — Uses `group: 'shop'` from descriptors to enumerate demo-shop modules.
- **`tests/cross-cutting/module-descriptors.test.ts`** — The "cross-cutting test that proves every descriptor is well-formed," directly exercising `readAllModuleDescriptors`.
- **`tests/cross-cutting/audit-actions.test.ts`** — Previously kept its own exemption list; now reads the `noAudit` field from descriptors.
- **`tests/cross-cutting/frontend-pairing.test.ts`** — Validates pairing rules, likely via `frontendCounterparts` / `frontendPairingSchema`.
- **`tests/unit/scripts/docs/module-descriptor.test.ts`** — Unit tests for the schemas and read helpers in this file.
- **`tests/unit/scripts/modules/new-module-needs-nothing.test.ts`** — Verifies that a new module needing only a descriptor (plus `src/modules.ts`) is sufficient.
- **`tests/unit/scripts/scaffold/plan.test.ts`** — Scaffold planning that references descriptor fields when generating a new module's boilerplate.

## Notes

- Both schemas are `.strict()`: an unrecognized key in `module.yaml` is a hard parse error, not silently ignored. Adding a field requires updating `moduleDescriptorSchema` first.
- `noAudit` is a non-empty *string* (the reason), not a boolean. A module that ships an `audit.ts` must not carry this key.
- `frontendCounterparts` silently falls back to the module's own folder name when `frontend` is absent — callers can rely on always getting a non-empty array.
- `readAllModuleDescriptors` uses `.toSorted()` (non-mutating, ES 2023) rather than `.sort()`.
- The file is a pure named-export module; there is no default export.
