---
source: scripts/docs/module-descriptor.ts
sha256: f5d5a2ba41b0a83653600560333895b7f61facf1bbca3cf3bcbe150271428517
generated_at: 2026-10-14T07:17:08.358793+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/module-descriptor.ts

## Purpose

A single typed reader for `module.yaml` descriptor files. It defines a Zod schema that every module folder must satisfy, then exposes helpers to read one or all descriptors from disk. Both the docs generators (module graph, catalogue) and the cross-cutting tests (audit actions, frontend pairing, well-formedness) consume the same schema, so adding a field to one `module.yaml` cannot silently desynchronise any downstream consumer.

## Key elements

- **`frontendPairingSchema`** — Zod object for the optional `frontend` key: a `counterparts` array and an optional `why` sentence. Strict (no extra keys).
- **`moduleDescriptorSchema`** — Zod object for the full `module.yaml`: `summary`, `subdomain` (core/supporting/generic), `group` (foundation/shop/example), `dependsOn`, optional `noAudit`, optional `frontend`. Strict.
- **`ModuleDescriptor`** — TypeScript type inferred from the schema.
- **`readModuleDescriptor(descriptorPath)`** — Reads a single `module.yaml` from disk, parses it as YAML, validates against the schema. Throws on mismatch.
- **`readAllModuleDescriptors(modulesRoot)`** — Scans a `src/modules`-style directory, returns a `Record<string, ModuleDescriptor>` (keyed by folder name, alphabetically ordered) for every subfolder that contains a `module.yaml`.
- **`frontendCounterparts(name, descriptor)`** — Returns the descriptor's `frontend.counterparts` list, falling back to `[name]` when the field is absent.

## Relationships

- **`scripts/docs/generate-module-graph.ts`** — Consumes `readAllModuleDescriptors` to colour edges/nodes in the module graph with `subdomain`, `group`, and `dependsOn`.
- **`scripts/docs/module-catalogue.ts`** — Reads `summary` and `subdomain` from descriptors to render the docs index.
- **`tests/cross-cutting/audit-actions.test.ts`** — Reads the `noAudit` field to collect exemption reasons instead of maintaining its own list; also checks that modules with an `audit.ts` do not carry it.
- **`tests/cross-cutting/frontend-pairing.test.ts`** — Validates `frontendPairingSchema` invariants across all modules (e.g. `why` present when counterpart ≠ own name).
- **`tests/cross-cutting/module-descriptors.test.ts`** — Asserts every `module.yaml` in the repo parses cleanly through `moduleDescriptorSchema`.
- **`tests/unit/scripts/docs/module-descriptor.test.ts`** — Unit-tests the reader helpers and schema directly.
- **`tests/unit/scripts/scaffold/plan.test.ts`** — Verifies that the scaffold plan emits a `module.yaml` satisfying this schema.
- **`tests/unit/scripts/modules/new-module-needs-nothing.test.ts`** — Confirms a fresh module with only the required descriptor fields passes validation.
- **`scripts/testing/demo-module-names.ts`** — Supplies test fixture module names used by the cross-cutting tests that read descriptors.

## Notes

- The schema is `.strict()`: any unrecognised key in `module.yaml` is a hard error, not silently ignored. This is intentional to catch typos or misplaced fields early.
- `group` (`foundation` / `shop` / `example`) is also read by `.dependency-cruiser.cjs` rules (`foundation-cannot-reach-shop`, `nothing-reaches-example`), so the value is load-bearing for CI, not just documentation.
- `readAllModuleDescriptors` uses `Array.prototype.toSorted()` (ES 2023); the codebase must target a runtime that supports it.
- `frontendCounterparts` defaults to `[name]` when `frontend` is omitted, encoding the "same-name" convention as the fallback rather than requiring an explicit entry.
