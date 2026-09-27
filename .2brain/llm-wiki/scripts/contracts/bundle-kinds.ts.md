---
source: scripts/contracts/bundle-kinds.ts
sha256: 5e4718858fd1163526ebc22856d927365199d4587c16c5c4b2ff4dde27ba733d
generated_at: 2026-09-27T13:52:32.082313+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/bundle-kinds.ts

## Purpose

Defines the type system and shared utility functions for contract bundles. It establishes the two bundle kinds (compiled vs. generated), their common identity shape, and the small set of operations (assemble, read-committed, list-sources) that the CLI, the build orchestrator, and the staleness check all rely on. No bundle content is produced here; each bundle owns its own build mechanism.

## Key elements

- **`REPO_ROOT`** — Resolved absolute path to the repository root, computed from `scripts/contracts/`.
- **`BundleIdentity`** (interface, not exported) — Shared shape: `name`, `label`, `output`, and optional `shared?: false`. The `shared` flag marks a bundle as backend-only (e.g. `asyncapi.yaml`); its absence means the frontend receives a copy.
- **`CompiledBundle`** (interface) — Extends identity with `content()`, `sources()`, and a `compiled: true` literal. Represents a bundle built from authored source files.
- **`GeneratedBundle`** (interface) — Extends identity with `content()` and a `generated: true` literal. Represents a bundle derived from an already-committed document.
- **`ContractBundle`** (type) — Union of the two interfaces.
- **`isGenerated(bundle)`** — Type guard; discriminates by key presence (`'generated' in bundle`).
- **`assembleBundle(bundle)`** — Calls `bundle.content()` and returns the produced string.
- **`readCommittedBundle(bundle)`** — Reads `bundle.output` from disk; returns `''` if the file does not exist (treated as "stale" rather than an error).
- **`bundleFragments(bundle)`** — Returns the authored source files for a compiled bundle; returns `[]` for a generated bundle.

## Relationships

- **`bundle-registry.ts`** — The registry declares entries that conform to `ContractBundle`; this file is the shape those entries satisfy.
- **`openapi-bundle.ts`** — Implements a `CompiledBundle` (built via `redocly bundle`).
- **`asyncapi-bundles.ts`** — Implements `CompiledBundle` entries (AsyncAPI docs merged through the YAML AST).
- **`client-collections-bundle.ts`** — Implements a `GeneratedBundle` (derived from `openapi.yaml`).
- **`build-bundles.ts`** — Calls `assembleBundle` and enforces the run ordering (all compiled bundles written before any generated bundle reads its upstream contract).
- **`tests/cross-cutting/contract-bundles.test.ts`** — Uses `readCommittedBundle` and `assembleBundle` to assert staleness (committed vs. freshly assembled) on every run; also validates the `shared` flag against the cross-repo pairing list.

## Notes

- The discriminant between kinds is the **presence** of the `generated` key, not a value comparison. `compiled` is a literal `true` but is not used in the type guard.
- `readCommittedBundle` deliberately returns an empty string for a missing file. This lets a fresh checkout or mid-rename state be reported as "stale, write it" instead of crashing the single command that would fix it.
- `shared` is declared (not inferred from the path) so the cross-cutting test can assert both halves of the pairing rule in one place.
- No mechanism for concatenating or merging bundle outputs lives in this file; that responsibility belongs to each individual bundle implementation.
