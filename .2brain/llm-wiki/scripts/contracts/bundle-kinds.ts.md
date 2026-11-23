---
source: scripts/contracts/bundle-kinds.ts
source_sha256: bcc154544d1719a6beeb944c95e2bb8cd421e1b2991f2e1e3b063bbd2148967d
context_sha256: 57d09f70d949618d29442337d04bcbfffe131f8ed9456852f5af4d120b8c9102
generated_at: 2026-11-22T01:54:15.561554+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/contracts/bundle-kinds.ts

## Purpose
Defines what a contract bundle is: the shape every entry in `bundle-registry.ts` declares, plus three small operations the CLI and staleness check perform on one (test generated-ness, produce text, read the committed copy). It builds no bundle itself. Each bundle owns its own build mechanism.

## Key elements
- `BundleIdentity` (internal interface): common fields `name` (CLI handle), `label` (on-disk name for messages), `output` (absolute path of the committed document), and optional `shared?: false`.
  - `shared` absent means the paired frontend holds a copy, so the bundle belongs in `scripts/pairing/spec-identity.ts`. `false` marks a backend-only bundle (the full AsyncAPI contract, since the frontend receives a subset holding only the channels it can reach).
- `CompiledBundle`: built from authored source files in this repo. `content: () => string` (sync), discriminated by `compiled: true`.
- `GeneratedBundle`: built from an already-committed document (the client collections, derived from the OpenAPI document). `content: () => Promise<string>` (async, since it scans every module's `probes.ts`), marked by `generated: true`.
- `ContractBundle`: union of the two.
- `isGenerated(bundle)`: type guard that checks only for the *presence* of the `generated` key.
- `assembleBundle(bundle)`: returns `Promise.resolve(bundle.content())`, a uniform async entry point for both kinds.
- `readCommittedBundle(bundle)`: reads `bundle.output` as UTF-8, returning `''` if the file doesn't exist.

## Relationships
- `bundle-registry.ts` declares the bundle entries using these types.
- `openapi-bundle.ts` (`redocly bundle`) and `asyncapi-bundles.ts` (YAML AST merge) are the compiled mechanisms; each supplies a bundle's `content`.
- `build-bundles.ts` is the CLI. It uses `isGenerated` to run compiled bundles first, so generated ones read a current OpenAPI document, and `assembleBundle` / `readCommittedBundle` to write and compare. Ordering lives there, not here.
- `tests/cross-cutting/contract-bundles.test.ts` asserts on every run that assembled output equals the committed copy. It also checks the `shared` rule: shared bundles must be in the cross-repo list, and backend-only ones must not be.

## Notes
- A missing committed file reads as `''` rather than throwing, so it counts as stale and the "write it" command can still run.
- `compiled` and `generated` are discriminant markers. Only generated bundles carry `generated`, so test for the key, not a value.
- `shared` is declared explicitly rather than inferred from the path so the test can enforce both halves of the rule.
