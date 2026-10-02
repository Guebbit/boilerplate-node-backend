---
source: scripts/contracts/bundle-kinds.ts
sha256: 51d3ef4009a3c387293016f7fdc001e794e3b14ea9ea9edb036a30754fe04f93
generated_at: 2026-10-01T12:25:48.353210+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/bundle-kinds.ts

## Purpose

Defines the type contract (`ContractBundle`) and a handful of small helpers that every bundle in the registry must satisfy. It encodes the single distinction that drives build ordering—**compiled** bundles (from authored source) run before **generated** bundles (from an already-committed document)—and provides the read/compare/fragment primitives the staleness check and CLI use. No bundle content is built here; each bundle owns its own build.

## Key elements

- **`BundleIdentity`** (interface, not exported) — common fields: `name`, `label`, `output`, and optional `shared?: false` to mark a bundle as backend-only.
- **`CompiledBundle`** (exported interface) — extends `BundleIdentity` with synchronous `content()`, a `sources()` list of authored files, and `compiled: true`.
- **`GeneratedBundle`** (exported interface) — extends `BundleIdentity` with async `content()` (scans modules at build time), and `generated: true`.
- **`ContractBundle`** (exported type) — the `CompiledBundle | GeneratedBundle` union.
- **`REPO_ROOT`** (exported const) — absolute path to the repo root, resolved from `scripts/contracts/`.
- **`isGenerated(bundle)`** (exported const) — type guard using the `'generated' in bundle` key-presence check.
- **`assembleBundle(bundle)`** (exported const) — normalises both kinds to `Promise<string>` via `Promise.resolve(bundle.content())`.
- **`readCommittedBundle(bundle)`** (exported const) — reads the committed file at `bundle.output`; returns `''` if the file is absent (stale = fixable, not fatal).
- **`bundleFragments(bundle)`** (exported const) — returns `sources()` for compiled bundles, `[]` for generated ones (nothing authored sits between input and output).

## Relationships

- **`scripts/contracts/bundle-registry.ts`** — declares the concrete bundle entries whose objects conform to `CompiledBundle` / `GeneratedBundle`; this file is the shape they fill.
- **`scripts/contracts/openapi-bundle.ts`** — a `CompiledBundle` implementation (builds `openapi.yaml` via `redocly bundle`).
- **`scripts/contracts/asyncapi-bundles.ts`** — two `CompiledBundle` implementations (build AsyncAPI docs via YAML AST).
- **`scripts/contracts/client-collections-bundle.ts`** — a `GeneratedBundle` implementation (derives collections from `openapi.yaml`).
- **`scripts/contracts/build-bundles.ts`** — the orchestrator that reads `bundleFragments`/`isGenerated` to order compilation before generation, then calls `assembleBundle` and `readCommittedBundle` for the staleness comparison.
- **`tests/cross-cutting/contract-bundles.test.ts`** — asserts the committed-vs-generated comparison on every run; also validates the `shared` flag against the cross-repo spec-identity list.
- **`tests/unit/scripts/modules/new-module-needs-nothing.test.ts`** — exercises the "no authored fragments" path for generated bundles.

## Notes

- The discriminant is **key presence**, not a string value: only `GeneratedBundle` carries the `generated` key. A `compiled` literal exists for symmetry but `isGenerated` checks for `'generated'`.
- `shared?: false` uses *absence-as-true* semantics (a bundle is shared with the frontend unless it explicitly says otherwise). `asyncapi.yaml` is the one `false` case.
- `readCommittedBundle` deliberately returns `''` for a missing file rather than throwing—treating a missing output as "stale, needs writing" so the fixing command itself never crashes.
- `assembleBundle` exists solely to erase the sync/async difference at the call site; it adds no logic of its own.
