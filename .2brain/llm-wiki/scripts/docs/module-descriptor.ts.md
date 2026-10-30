---
source: scripts/docs/module-descriptor.ts
sha256: 9d3348ea56155e520a8aa2bda69d86f158fe8d958741b0db1a478e140c0884f1
generated_at: 2026-10-29T01:36:19.112934+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/module-descriptor.ts

## Purpose

A single typed reader for each module's `module.yaml`. It centralises YAML parsing and Zod validation so that the docs generator, cross-cutting tests, and any other consumer all share one schema definition — eliminating the drift that occurs when a second, hand-rolled parse of the same file misses a newly added field.

## Key elements

- **`moduleDescriptorSchema`** — Strict Zod schema describing the full `module.yaml` contract: `summary`, `subdomain`, `group`, `dependsOn`, `noAudit`, `frontend`, `rateLimits`, `jobs`. `.strict()` rejects any unexpected key.
- **`ModuleDescriptor`** — TypeScript type inferred from the schema (`z.infer`).
- **`readModuleDescriptor(descriptorPath)`** — Reads a single `module.yaml` from disk, parses it as YAML, and validates it against the schema. Throws on mismatch.
- **`readAllModuleDescriptors(modulesRoot)`** — Scans `modulesRoot` for folders containing a `module.yaml` (via `modulesWith`) and returns a `Record<string, ModuleDescriptor>` keyed by folder name.
- **`frontendCounterparts(name, descriptor)`** — Returns the list of frontend module names for a domain, falling back to the module's own name when no `frontend` block is present.
- **`frontendPairingSchema`** — Internal (non-exported) strict schema for the `frontend` object: `counterparts` (string array) and optional `why`.

## Relationships

- **Imports from `scripts/modules-on-disk.ts`** — uses `modulesWith` to enumerate module folders that contain a `module.yaml`.
- **Imports from `src/infrastructure/config/shared-rules/jobs.ts`** — reuses `jobsBlockSchema` so the `jobs` field stays in lockstep with the runtime jobs config.
- **Imports from `src/infrastructure/config/shared-rules/rate-limits.ts`** — reuses `rateLimitsBlockSchema` for the same lockstep reason.
- **Consumed by `scripts/docs/generate-module-graph.ts`** — the docs generator calls the reader to colour the module graph.
- **Read by `tests/cross-cutting/module-descriptors.test.ts`** — asserts every descriptor on disk is well-formed.
- **Read by `tests/cross-cutting/audit-actions.test.ts`** — checks the `noAudit` field rather than maintaining a separate exemption list.
- **Read by `tests/cross-cutting/frontend-pairing.test.ts`** — validates the `frontend` pairing data.
- **Unit-tested by `tests/unit/scripts/docs/module-descriptor.test.ts`.**

## Notes

- The schema is `.strict()`: an unknown key in `module.yaml` is treated as a typo and will fail validation at read time.
- The `group` field (`foundation` / `shop` / `example`) is consumed by `.dependency-cruiser.cjs` rules (`foundation-cannot-reach-shop`, `nothing-reaches-example`) and enforced fail-closed in CI.
- `rateLimits` and `jobs` are *data* in the descriptor; the actual runtime wiring lives in the generated `<module>/rate-limits.generated.ts` and `<module>/jobs.generated.ts` files (produced by `npm run regenerate`), not in this file.
- `frontendCounterparts` returns the module's own name as a default — callers should not assume the `frontend` block is always present.
