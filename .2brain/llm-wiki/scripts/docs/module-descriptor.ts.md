---
source: scripts/docs/module-descriptor.ts
sha256: 98d361984310c8aeaa5a99172aec249a4a5caa155672d34bfa5d931273c61bd0
generated_at: 2026-10-15T09:41:13.897826+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/module-descriptor.ts

## Purpose

Single typed reader for each module's `module.yaml` file. It defines the Zod schema that every descriptor must satisfy and exposes helpers to load one or all descriptors from disk. Both the docs generator (module graph, catalogue) and the cross-cutting test suite import from here so there is exactly one parse path — adding a field is a one-file edit, not a silent divergence between two hand-rolled parsers.

## Key elements

- **`frontendPairingSchema`** – Zod schema for the optional `frontend` key: `counterparts` (array of frontend module names) and an optional `why` sentence.
- **`moduleDescriptorSchema`** – Strict Zod object schema for the whole `module.yaml`: `summary`, `subdomain` (core/supporting/generic), `group` (foundation/shop/example), `dependsOn`, optional `noAudit`, optional `frontend`. Rejects unknown keys.
- **`ModuleDescriptor`** – `z.infer` type of the schema.
- **`readModuleDescriptor(descriptorPath)`** – Reads a single `module.yaml` from disk, parses YAML, validates against the schema; throws on mismatch.
- **`readAllModuleDescriptors(modulesRoot)`** – Scans `modulesRoot` for folders containing `module.yaml` (via `modulesWith`), reads each one, returns a `Record<folderName, ModuleDescriptor>` in alphabetical order.
- **`frontendCounterparts(name, descriptor)`** – Returns the explicit `frontend.counterparts` list if present, otherwise falls back to `[name]` (the "same-name" default).

## Relationships

- **`scripts/modules-on-disk.ts`** – Provides `modulesWith`, which `readAllModuleDescriptors` calls to discover which folders under a root carry a `module.yaml`.
- **`scripts/docs/generate-module-graph.ts`** – Consumes descriptors (likely `group`, `subdomain`, `dependsOn`) to colour/edge the module graph.
- **`scripts/docs/module-catalogue.ts`** – Consumes `summary`, `subdomain`, `group` to render the docs index and sidebar.
- **`scripts/scaffold/options.ts`** – Validates scaffold output against the same schema so a new module's `module.yaml` is well-formed at creation time.
- **`tests/cross-cutting/audit-actions.test.ts`** – Reads the `noAudit` field to determine which modules are exempt from the "must emit an audit action" rule.
- **`tests/cross-cutting/frontend-pairing.test.ts`** – Reads `frontend.counterparts` / `frontend.why` to assert pairing consistency.
- **`tests/cross-cutting/module-descriptors.test.ts`** – Calls `readAllModuleDescriptors` and asserts every descriptor satisfies the schema.
- **`tests/unit/scripts/docs/module-descriptor.test.ts`** – Unit-tests `readModuleDescriptor`, `readAllModuleDescriptors`, and `frontendCounterparts` in isolation.
- **`tests/unit/scripts/modules/new-module-needs-nothing.test.ts`** – Verifies that scaffolding a module requires no edits outside the module folder and `src/modules.ts`.
- **`tests/unit/scripts/scaffold/plan.test.ts`** – Exercises scaffold planning, relying on the descriptor schema as the source of truth for required fields.

## Notes

- The schema is **strict** (`.strict()`): any key not listed is rejected at parse time. This is intentional — an extra key signals a typo or a misunderstanding of the file's contract.
- `group` is not merely documentation: `.dependency-cruiser.cjs` reads it to enforce `foundation-cannot-reach-shop` and `nothing-reaches-example` rules (fail-closed).
- `noAudit` and a module having an `audit.ts` file are mutually exclusive; the cross-cutting audit test enforces this invariant rather than maintaining its own exemption list.
- `frontendCounterparts` defaults to `[name]` when the `frontend` key is absent — the "ordinary case" where a module pairs with a same-named frontend module.
