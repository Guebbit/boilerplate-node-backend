---
source: tests/cross-cutting/contract-bundles.test.ts
sha256: 3f7feefd51fe85eb77b27caf87ae5e707aaffbdfb6d387970d9d3590f0821922
generated_at: 2026-10-15T12:36:35.504803+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/contract-bundles.test.ts

## Purpose

Cross-cutting test that validates every contract bundle in the repo against invariants of provenance, internal consistency, and cross-repo sharing. It answers two questions per bundle kind: for **authored** (committed) bundles, that the fragments on disk are non-empty and the output matches the cross-repo shared-file contract; for **generated** bundles (client collections, OpenAPI), that the generator produces a well-formed document covering the full contract. It also cross-checks `MODULE_SECTIONS` against the live module list and asserts that every documented REST path belongs to exactly one module or the application root.

## Key elements

- **`AUTHORED_BUNDLES`** — `CONTRACT_BUNDLES` filtered to non-generated entries; drives the parameterised "fragments carry content" and "shared-files" cases.
- **`bundleByName(name)`** — resolves a `ContractBundle` from the registry by name; throws if missing.
- **`counted(groups)`** — sums request items across Postman-style folder structures (supports both `items` and `children` keys).
- **`describe('every contract bundle')`** — (1) asserts every fragment file is non-empty (canary against silent empty resolution); (2) asserts the set of non-generated bundles with `shared !== false` exactly matches the backend entries in `SHARED_FILES`.
- **`describe('MODULE_SECTIONS')`** — recomputes the expected section list from `enabledModules` + filesystem (`src/modules/<name>/openapi.yaml`) and asserts set-equality with `MODULE_SECTIONS`. Serves as the independent check `openapi-bundle.ts` cannot perform itself (would create a circular import through the generated `@api/` client).
- **`describe('the OpenAPI bundle')`** — (1) each module spec is standalone-valid OpenAPI with a `paths` key and ≥ 1 schema; (2) the union of module paths plus the four root paths (`/`, `/.well-known/security.txt`, `/livez`, `/readyz`) exactly equals the committed bundle's path set with no duplicates.
- **`asyncDocument(name)`** — parses a committed AsyncAPI bundle into a typed shape for channel/operation/message assertions.
- **`describe.each([['asyncapi'], ['asyncapi-public']])`** — (1) every channel declares ≥ 1 message that resolves in `components.messages`; (2) every operation's channel `$ref` exists and its message `$ref`s are bound under that channel's namespace.

## Relationships

- **`scripts/contracts/bundle-registry.ts`** — primary data source: imports `CONTRACT_BUNDLES`, `bundleFragments`, `isGenerated`, `readCommittedBundle`, `assembleBundle`, and the `ContractBundle` type. All bundle metadata (name, output path, shared flag, generated flag) flows from here.
- **`scripts/contracts/openapi-bundle.ts`** — provides `MODULE_SECTIONS` (the list of module specs to validate) and `moduleSpec(section)` (resolves the on-disk path for each section).
- **`scripts/contracts/client-collections-bundle.ts`** — imports `allProbes`, used to enumerate the generated client-collection probes the test validates.
- **`scripts/pairing/spec-identity.ts`** — imports `SHARED_FILES`; the shared-files test cross-checks bundle outputs against this cross-repo pairing table.
- **`src/modules.ts`** — imports `enabledModules`; the `MODULE_SECTIONS` test derives its expected set from this live registry.
- **`scripts/modules-on-disk.ts`** — imports `REPO_ROOT` for path construction.
- **`scripts/contracts/bundle-kinds.ts`** — no direct import in this file; participates transitively through `bundle-registry.ts` type definitions.

## Notes

- `openapi.yaml` and the four client collections are `.gitignore`d; only `asyncapi.yaml` and `asyncapi.public.yaml` are committed. Byte-for-byte freshness of the committed files is enforced by a separate `check:contracts-bundle --check` script and the CI `contracts-bundle-freshness` job's `git diff`, **not** by a second Jest case in this file.
- Generated bundles are tested by re-running the generator in-memory and asserting on the output, not by comparing to a committed copy (none exists).
- The root-path list in the OpenAPI attribution test is hardcoded (`/`, `/.well-known/security.txt`, `/livez`, `/readyz`). Adding a new system route without adding it here will fail the test.
- `MODULE_SECTIONS` equivalence with `enabledModules` is deliberately a *second* computation to avoid the circular-import problem the bundler itself faces (codegen depends on the bundle; the bundle must not import codegen output).
- YAML comments do not survive parsing, so no compiled-bundle test asserts on comment presence; that placement concern lives in the source module files, not the bundle.
