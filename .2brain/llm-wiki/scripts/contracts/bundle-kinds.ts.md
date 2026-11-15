---
source: scripts/contracts/bundle-kinds.ts
sha256: e94472c225b7ee3858de13750529d1c07ba4fd9f04a66795d52179509faaa654
generated_at: 2026-11-14T17:23:03.092063+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/bundle-kinds.ts

## Purpose

Defines the shared type contract that every entry in the bundle registry must satisfy. It distinguishes two kinds of bundles — **Compiled** (built from authored source files) and **Generated** (derived from an already-committed document) — and provides the three operations common to all: identity metadata, producing the document text, and reading the committed copy for staleness comparison. This file performs no building or concatenation; each bundle owns its own build mechanism.

## Key elements

- **`BundleIdentity`** (internal interface) — `name`, `label`, `output` (absolute path), and optional `shared?: false`. The `shared` field is absent-by-default (meaning the bundle is shared with the frontend); `false` marks it backend-only (e.g. `asyncapi.yaml`).
- **`CompiledBundle`** (exported) — extends `BundleIdentity`; adds `content: () => string` (synchronous) and `compiled: true` literal.
- **`GeneratedBundle`** (exported) — extends `BundleIdentity`; adds `content: () => Promise<string>` (async) and `generated: true` literal.
- **`ContractBundle`** (exported type) — union `CompiledBundle | GeneratedBundle`.
- **`isGenerated`** (exported) — type guard; checks for the *presence* of the `generated` key rather than comparing a value.
- **`assembleBundle`** (exported) — calls `bundle.content()` and wraps the result in `Promise.resolve`, giving callers a single async call site regardless of kind.
- **`readCommittedBundle`** (exported) — reads the committed file at `bundle.output`; returns `''` (not an exception) if the file is absent, so a missing output is treated as "stale → write it" rather than a crash.

## Relationships

- **`scripts/contracts/bundle-registry.ts`** — declares the concrete bundle entries that conform to `CompiledBundle` / `GeneratedBundle` as defined here.
- **`scripts/contracts/build-bundles.ts`** — orchestrates a full run in two phases (all compiled first, then generated) and calls `assembleBundle` / `readCommittedBundle` to produce and compare documents.
- **`scripts/contracts/openapi-bundle.ts`** — implements one `CompiledBundle` (joins OpenAPI sources via `redocly bundle`).
- **`scripts/contracts/asyncapi-bundles.ts`** — implements the two AsyncAPI `CompiledBundle`s (merged through the YAML AST).
- **`tests/cross-cutting/contract-bundles.test.ts`** — asserts the committed-vs-produced comparison on every run and enforces the `shared` field rule (shared bundles must appear in the cross-repo list; backend-only ones must not).

## Notes

- **Discriminant is key presence, not value.** `isGenerated` checks `'generated' in bundle`; there is no `false` value to compare against.
- **`shared` is intentionally typed as `false`-only.** Absent means "shared with frontend." It is declared (not inferred from the path) so the cross-cutting test can assert both halves of the inclusion/exclusion rule.
- **Missing file ≠ error.** `readCommittedBundle` returns an empty string for a nonexistent output so that the one command that fixes a stale state can actually run; throwing here would make the fix command unrunnable.
- **Ordering is not this file's concern.** The two-phase run order (compiled → generated) lives in `build-bundles.ts`; this file only models *what* a bundle is and *how to ask it for its text*.
