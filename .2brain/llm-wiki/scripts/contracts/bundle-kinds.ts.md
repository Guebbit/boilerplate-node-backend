---
source: scripts/contracts/bundle-kinds.ts
sha256: 0934917ac6c1cc2bedce8e2399183e28e451be8e0f6ac2744307dd880a4fb9f6
generated_at: 2026-10-15T09:36:20.772056+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/bundle-kinds.ts

## Purpose

Defines the type system for contract bundles and provides four thin utility functions that operate over a `ContractBundle` without performing any bundling. It exists so that `bundle-registry.ts`, `build-bundles.ts`, and the cross-cutting test can all share one vocabulary for "compiled vs. generated" and a uniform way to produce, read, and compare a bundle's output.

## Key elements

- **`BundleIdentity`** (interface, not exported) — common fields: `name` (CLI handle), `label`, `output` (absolute path), and optional `shared?: false`. A bundle is shared with the frontend by default; `asyncapi.yaml` opts out.
- **`CompiledBundle`** (exported interface) — extends `BundleIdentity` with `content: () => string` (synchronous) and `sources: () => readonly string[]`. Represents documents built from authored files in this repo (e.g. via `redocly bundle` or YAML AST merge). Discriminated by `compiled: true`.
- **`GeneratedBundle`** (exported interface) — extends `BundleIdentity` with `content: () => Promise<string>` (async, because collections scan `probes.ts` modules). Represents documents derived from an already-committed document (the client collections). Discriminated by `generated: true`.
- **`ContractBundle`** (exported type) — the union `CompiledBundle | GeneratedBundle`.
- **`isGenerated`** (exported const) — type guard that checks `'generated' in bundle` (key presence, not value).
- **`assembleBundle`** (exported const) — wraps `bundle.content()` in `Promise.resolve` so callers get a single `Promise<string>` regardless of kind. Does not handle ordering.
- **`readCommittedBundle`** (exported const) — reads the file at `bundle.output`; returns `''` if the file is absent rather than throwing (a missing file is "stale", and the caller needs to fix it, not crash).
- **`bundleFragments`** (exported const) — returns the authored source paths for a compiled bundle, or `[]` for a generated one. Used by the staleness check.

## Relationships

- **`bundle-registry.ts`** — declares each registry entry as a `CompiledBundle` or `GeneratedBundle`; this file supplies the shape it fills in.
- **`openapi-bundle.ts`** / **`asyncapi-bundles.ts`** — implement the `content()` and `sources()` methods of `CompiledBundle` entries; they are the two concrete compiled producers.
- **`build-bundles.ts`** — consumes `isGenerated` to split bundles into two phases (compiled first, then generated) and calls `assembleBundle` to produce text.
- **`tests/cross-cutting/contract-bundles.test.ts`** — imports `ContractBundle`, `isGenerated`, `assembleBundle`, `readCommittedBundle`, and `bundleFragments` to assert that produced text matches the committed copy on every run and to enforce the `shared` / backend-only pairing rule.

## Notes

- The discriminant is **key presence**, not a string value: only `GeneratedBundle` carries the `generated` key at all, so `isGenerated` uses `'generated' in bundle` rather than a `.compiled === false` check.
- `content()` is **synchronous** for compiled bundles and **asynchronous** for generated ones. Callers must always go through `assembleBundle` (or `await`) to handle both uniformly.
- `shared` is typed as `shared?: false` (optional, only-false) rather than `boolean`, making "present and false" the explicit opt-out while absence means shared. This lets the test assert both directions without ambiguity.
- `readCommittedBundle` deliberately returns `''` for a missing file. Do not add a throw or a default read; the "stale → regenerate" flow depends on the caller seeing an empty string and writing.
