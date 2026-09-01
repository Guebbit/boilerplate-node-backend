# scripts/contracts/bundle-kinds.ts

## Purpose

Defines the type system for contract bundles: the two shapes (`CompiledBundle` and `GeneratedBundle`) that every entry in `bundle-registry.ts` must conform to, plus the three operations the CLI and staleness check perform on them (produce text, read the committed copy, enumerate source fragments). It is a pure interface/helper module — it builds nothing itself.

## Key elements

- **`REPO_ROOT`** — absolute path to the repo root, resolved relative to `scripts/contracts/`.
- **`BundleIdentity`** — shared interface: `name` (CLI handle), `label` (display name), `output` (absolute path of the committed document), and optional `shared?: false` (marks a bundle as backend-only so it is excluded from the cross-repo spec-identity list).
- **`CompiledBundle`** — extends `BundleIdentity`; declares `content()`, `sources()`, and `compiled: true`. Used by bundles whose inputs are hand-authored files in this repo (e.g. `openapi.yaml`, the two AsyncAPI documents).
- **`GeneratedBundle`** — extends `BundleIdentity`; declares `content()` and `generated: true`. Used by bundles derived from another committed document (e.g. client collections from `openapi.yaml`).
- **`ContractBundle`** — union type `CompiledBundle | GeneratedBundle`.
- **`isGenerated(bundle)`** — type guard; checks presence of the `'generated'` key (no value comparison).
- **`assembleBundle(bundle)`** — calls `bundle.content()` and returns the produced string.
- **`readCommittedBundle(bundle)`** — reads `bundle.output` from disk; returns `''` if the file does not exist rather than throwing.
- **`bundleFragments(bundle)`** — returns the authored source files for a compiled bundle; returns `[]` for a generated bundle.

## Relationships

- **`scripts/contracts/bundle-registry.ts`** — the registry of bundle entries is typed against `ContractBundle` (or its constituent interfaces) declared here.
- **`scripts/contracts/openapi-bundle.ts`** — provides a concrete `CompiledBundle` (built via `redocly bundle`).
- **`scripts/contracts/asyncapi-bundles.ts`** — provides concrete `CompiledBundle`s (built via YAML AST merge).
- **`scripts/contracts/client-collections-bundle.ts`** — provides the `GeneratedBundle` (derived from the committed `openapi.yaml`).
- **`scripts/build-contract-bundles.ts`** — the CLI orchestrator; uses `assembleBundle`, `readCommittedBundle`, and `bundleFragments` to write bundles and detect staleness. Ordering (compiled before generated) is its responsibility, not this file's.
- **`tests/cross-cutting/contract-bundles.test.ts`** — asserts on every run that `assembleBundle` output matches `readCommittedBundle` output, and enforces the `shared` flag rule (shared bundles must appear in the cross-repo list; `shared: false` bundles must not).

## Notes

- The discriminant is key **presence** (`'generated' in bundle`), not a value check. A `CompiledBundle` never carries the `generated` key.
- `readCommittedBundle` intentionally returns `''` for a missing file so the caller can treat it as "stale, write it" instead of crashing.
- `bundleFragments` is used by the staleness check to know *which* files to watch; a generated bundle always returns an empty array because nothing authored sits between its input and output.
- The `shared` field is declared (not inferred) so the test can assert both directions of the rule in one place.
