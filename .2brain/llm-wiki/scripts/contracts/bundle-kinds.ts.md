---
source: scripts/contracts/bundle-kinds.ts
sha256: 0934917ac6c1cc2bedce8e2399183e28e451be8e0f6ac2744307dd880a4fb9f6
generated_at: 2026-11-08T02:39:43.982735+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/bundle-kinds.ts

## Purpose

Defines the type system for contract bundles (the two kinds, their identity fields) and provides four small utility functions — assemble, read-committed, list-fragments, and a type guard. It intentionally performs no building or concatenation; each bundle owns its own production mechanism. What lives here is only what every bundle has in common: an identity, a way to produce text, and a way to read the committed copy for staleness comparison.

## Key elements

- **`BundleIdentity`** (private interface) — `name`, `label`, `output`, and optional `shared?: false`. The `shared` flag defaults to "yes" by absence; only `asyncapi.yaml` sets it to `false`.
- **`CompiledBundle`** (exported interface) — A bundle built from authored source files. Carries sync `content()`, `sources()`, and the literal discriminant `compiled: true`.
- **`GeneratedBundle`** (exported interface) — A bundle derived from another already-committed document (e.g. client collections from `openapi.yaml`). Carries async `content()` and the literal discriminant `generated: true`.
- **`ContractBundle`** (exported type) — `CompiledBundle | GeneratedBundle`.
- **`isGenerated`** — Type guard; checks key *presence* (`'generated' in bundle`), not value.
- **`assembleBundle`** — Normalises the sync/async split into a single `Promise<string>` by calling `bundle.content()`.
- **`readCommittedBundle`** — Reads `bundle.output` from disk; returns `''` if the file is absent (by design, so the staleness-fix command still runs).
- **`bundleFragments`** — Returns `bundle.sources()` for compiled bundles; returns `[]` for generated ones.

## Relationships

- **`scripts/contracts/bundle-registry.ts`** — Every entry in the registry conforms to `ContractBundle`; this file is the contract the registry fulfils.
- **`scripts/contracts/build-bundles.ts`** — Owns the execution ordering (all compiled before all generated). This file's `assembleBundle` is the per-bundle call that function makes; the sequencing is not this file's concern.
- **`scripts/contracts/openapi-bundle.ts`** — Implements `CompiledBundle` via `redocly bundle`.
- **`scripts/contracts/asyncapi-bundles.ts`** — Implements `CompiledBundle` via YAML-AST merging for the two AsyncAPI documents.
- **`tests/cross-cutting/contract-bundles.test.ts`** — Asserts on every run that `assembleBundle` output matches `readCommittedBundle` output, and validates the `shared` flag against the cross-repo pairing list.

## Notes

- The discriminant is key **presence**, not value: `'generated' in bundle` is sufficient; there is no `compiled` check needed because its absence implies the other kind.
- `readCommittedBundle` returning `''` for a missing file is intentional, not a shortcut. A missing output is the definition of "stale"; throwing here would make the very command that would fix the state unable to run.
- `shared?: false` is declared (not inferred from the path) so the test can assert both directions: shared bundles must appear in the cross-repo list, and `shared: false` bundles must not.
- No bundle concatenation or shared build pipeline exists in this file. The OpenAPI bundle and the AsyncAPI bundles use entirely different production mechanisms; this file only abstracts the common surface.
