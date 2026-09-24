---
source: scripts/contracts/bundle-kinds.ts
sha256: 732dac7d479aaff25c41420ef9ce895271e52284892344de71c862af6f7cb9f5
generated_at: 2026-09-23T17:21:57.208281+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/bundle-kinds.ts

## Purpose

Defines the type system for contract bundles—distinguishing **compiled** bundles (built from authored source files) from **generated** ones (built from an already-committed document)—and provides the small set of shared operations (assemble, read-committed, list-source-files) that the CLI, the staleness check, and the test suite call uniformly on either kind. It contains no bundling logic; each bundle owns its own build.

## Key elements

- **`REPO_ROOT`** — Resolved absolute path to the repository root (two levels above `scripts/contracts/`).
- **`BundleIdentity`** (interface) — Common fields: `name` (CLI handle), `label` (human-readable), `output` (absolute path of the committed document), and `shared?: false` (omitted = shared with frontend; explicit `false` = backend-only, e.g. `asyncapi.yaml`).
- **`CompiledBundle`** (interface) — Extends `BundleIdentity` with `content(): string`, `sources(): readonly string[]`, and the literal flag `compiled: true`.
- **`GeneratedBundle`** (interface) — Extends `BundleIdentity` with `content(): string` and the literal flag `generated: true`.
- **`ContractBundle`** (type) — Union of `CompiledBundle | GeneratedBundle`.
- **`isGenerated(bundle)`** — Type guard; checks *presence* of the `'generated'` key (not a value comparison).
- **`assembleBundle(bundle)`** — Delegates to `bundle.content()` to produce the document text.
- **`readCommittedBundle(bundle)`** — Reads `bundle.output` from disk; returns `''` if the file does not exist (a missing file *is* the stale state, not an error).
- **`bundleFragments(bundle)`** — Returns the authored source files a compiled bundle depends on; returns `[]` for generated bundles.

## Relationships

- **`scripts/contracts/bundle-registry.ts`** — Declares entries whose shape is `ContractBundle`; this file provides the type they conform to.
- **`scripts/contracts/build-bundles.ts`** — Orchestrates a full run (compiled first, then generated) and calls `assembleBundle` / `readCommittedBundle` for the staleness comparison.
- **`scripts/contracts/openapi-bundle.ts`**, **`scripts/contracts/asyncapi-bundles.ts`** — Concrete implementations of `CompiledBundle`.
- **`scripts/contracts/client-collections-bundle.ts`** — Concrete implementation of `GeneratedBundle`.
- **`tests/cross-cutting/contract-bundles.test.ts`** — Asserts that `assembleBundle` output matches `readCommittedBundle` on every run and enforces the `shared` / backend-only pairing rule.

## Notes

- The discriminant between the two kinds is the **presence** of the `generated` key, not a value. `isGenerated` uses `'generated' in bundle`, so there is no `kind` string to compare.
- `readCommittedBundle` deliberately returns `''` rather than throwing when the output file is absent. A missing file means "stale, write it"; crashing here would prevent the very command that fixes the state from running.
- `shared` is typed `false` (not `boolean`) so that *omission* means "shared with the frontend" and *explicit `false`* means "backend-only." This is intentional so the test can assert both directions of the rule.
- This file performs no I/O beyond the single `readFileSync` in `readCommittedBundle` and the `existsSync` guard. All actual document construction lives in the individual bundle modules.
