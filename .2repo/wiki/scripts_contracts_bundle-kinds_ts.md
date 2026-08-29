# scripts/contracts/bundle-kinds.ts

## Purpose

Defines the type system and three shared helpers that every contract bundle entry must satisfy: an identity (name, label, output path), a way to produce the document text, and a way to read the committed copy for comparison. It also encodes the two discriminated kinds — **compiled** (built from authored source files) and **generated** (derived from an already-committed document) — whose distinction is what orders a full build so downstream bundles read a current contract.

## Key elements

- **`BundleIdentity`** (interface) — shared fields: `name` (CLI handle), `label` (human label), `output` (absolute path), `shared?` (optional `false`; absence means the document is also consumed by the frontend).
- **`CompiledBundle`** (interface) — extends identity with `content()`, `sources()`, and the literal `compiled: true`. Inputs are hand-written files in this repo.
- **`GeneratedBundle`** (interface) — extends identity with `content()` and the literal `generated: true`. Input is a committed document, not authored source.
- **`ContractBundle`** — union: `CompiledBundle | GeneratedBundle`.
- **`isGenerated(bundle)`** — type guard; checks `'generated' in bundle` (presence, not value).
- **`assembleBundle(bundle)`** — delegates to `bundle.content()` to produce the document string.
- **`readCommittedBundle(bundle)`** — reads `bundle.output` from disk; returns `''` if the file is absent (treats missing as "stale" rather than throwing).
- **`bundleFragments(bundle)`** — returns `bundle.sources()` for compiled bundles, `[]` for generated bundles.
- **`REPO_ROOT`** — resolved absolute path to the repository root.

## Relationships

- **`scripts/contracts/bundle-registry.ts`** — its entries are typed as `ContractBundle`; this file is the contract they must satisfy.
- **`scripts/build-contract-bundles.ts`** — the orchestrator. Uses `isGenerated` to run all compiled bundles before all generated ones, then calls `assembleBundle` / `readCommittedBundle` to produce and compare documents.
- **`scripts/contracts/openapi-bundle.ts`, `asyncapi-bundles.ts`, `analytics-events-bundle.ts`** — each implements `CompiledBundle` (authored source → document).
- **`scripts/contracts/client-collections-bundle.ts`** — implements `GeneratedBundle` (derived from `openapi.yaml`).
- **`tests/cross-cutting/contract-bundles.test.ts`** — asserts that `readCommittedBundle` and `assembleBundle` agree for every registered bundle on each run.

## Notes

- **`shared?` is `false | undefined`, not `boolean`.** Absence means "yes, shared with the frontend." Only `asyncapi.yaml` opts out (`shared: false`) because the frontend receives the public subset instead.
- **Discriminant is key presence, not value.** `isGenerated` relies on `'generated' in bundle`; there is no `compiled: true` vs `compiled: false` comparison.
- **`readCommittedBundle` never throws for a missing file.** A missing output is the definition of "stale," and the caller needs `''` to decide "write it" rather than crash the one command that would fix the state.
- **No build logic lives here.** Each bundle owns its own `content()` implementation (redocly, YAML AST, verbatim splicing). This file only declares the common shape and the three shared operations.
