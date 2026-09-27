---
source: tests/cross-cutting/contract-bundles.test.ts
sha256: b5fe21f18efdbbc59567c55764e32b87754b1c9a4a8b881fcff1b8c2bd39a235
generated_at: 2026-09-27T15:49:44.396220+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/contract-bundles.test.ts

## Purpose

Cross-cutting test suite that verifies every contract bundle (OpenAPI, AsyncAPI, client collections) is structurally intact and consistent with its source fragments. It catches silent forks: empty fragments, orphaned paths, broken `$ref` chains, and drift between the module list and the bundled documents.

## Key elements

- **`AUTHORED_BUNDLES`** — `CONTRACT_BUNDLES` filtered to non-generated bundles; the set of bundles with a committed file on disk.
- **`describe('every contract bundle')`** — asserts each fragment resolves to non-empty content, and that `SHARED_FILES` lists exactly the shared (non-generated) bundles and excludes those with `shared: false`.
- **`describe('MODULE_SECTIONS')`** — asserts `MODULE_SECTIONS` is the exact set of enabled modules that ship their own `openapi.yaml`.
- **`describe('the OpenAPI bundle')`** — validates every module section is a standalone OpenAPI document with paths and schemas; asserts every documented path belongs to exactly one module or the two root routes (`/`, `/readyz`), with no overlap.
- **`asyncDocument(name)`** — parses a committed AsyncAPI bundle into a typed shape for channel/operation/message inspection.
- **`describe.each(['asyncapi', 'asyncapi-public'])`** — verifies every channel declares at least one resolvable message, every operation references an existing channel and that channel's own messages, and server-to-channel binding is symmetric (no orphan servers or unbound channels).
- **`counted` / `bundleByName`** — small local helpers for collection-folder counting and bundle lookup.

## Relationships

- **`scripts/contracts/bundle-registry.ts`** — primary source of `CONTRACT_BUNDLES`, `bundleFragments`, `isGenerated`, `readCommittedBundle`, `REPO_ROOT`, and the `ContractBundle` type that drives iteration throughout the file.
- **`scripts/contracts/openapi-bundle.ts`** — provides `MODULE_SECTIONS` and `moduleSpec`; the test validates invariants the bundler itself cannot check due to a circular dependency with generated code.
- **`scripts/contracts/client-collections-bundle.ts`** — imports `allProbes` (referenced in the client-collection generation path).
- **`scripts/pairing/spec-identity.ts`** — supplies `SHARED_FILES`, the cross-repo list this file cross-checks against `CONTRACT_BUNDLES`.
- **`src/modules.ts`** — provides `enabledModules`, used to derive the expected `MODULE_SECTIONS` set.

## Notes

- **Execution ordering matters.** `enabledModules` transitively imports the generated `@api/` client, so this test must run *after* codegen. That constraint is why the `MODULE_SECTIONS` assertion lives here rather than inside `openapi-bundle.ts`.
- **Freshness is not asserted here.** `openapi.yaml` is gitignored and rebuilt by `postinstall`; the CI `contracts-bundle-freshness` job's `git diff` is the actual guard against a missed re-bundle. This file only checks structural correctness of the build, not that the on-disk file matches a fresh rebuild.
- **`asyncapi.public.yaml` must be *absent* from `SHARED_FILES`.** The test asserts `shared === false` entries are not in the set, not merely that they are allowed. An accidental inclusion would mean the frontend carries broker/queue channels the public split removed.
- **Client collections are never byte-compared.** They are generated and gitignored, so the invariant checked is generator output correctness (every probe resolves), not file-on-disk equality.
