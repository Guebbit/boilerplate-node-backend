---
source: tests/cross-cutting/contract-bundles.test.ts
sha256: 1e76c153ec4b4fe270d2e9fe889b01116ea3f089ac7509b47fce54da5374e864
generated_at: 2026-11-08T09:25:22.042235+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/contract-bundles.test.ts

## Purpose

Validates the structural integrity of every contract bundle in the repo. For authored (compiled) bundles it checks that source fragments are non-empty and that the shared-file guard in `SHARED_FILES` matches exactly what is built here. For the OpenAPI bundle it verifies each module document is standalone and that every documented path belongs to exactly one module or the root. For the AsyncAPI bundles it asserts referential integrity across channels, messages, and operations. It deliberately does **not** compare committed output to a fresh build—that is `npm run check`'s responsibility.

## Key elements

- **`counted(groups)`** — helper that sums `items` or `children` lengths across Postman-style folder arrays (used for collection request counting).
- **`bundleByName(name)`** — resolves a `ContractBundle` from `CONTRACT_BUNDLES` by name; throws if missing.
- **`AUTHORED_BUNDLES`** — `CONTRACT_BUNDLES` filtered to non-generated bundles (everything except client collections).
- **`describe('every contract bundle')`** — (1) asserts every fragment of every authored bundle is non-empty (canary against silently dropped domains); (2) cross-checks `SHARED_FILES` against the bundle's `shared` flag to ensure the frontend guard covers exactly the right set of files.
- **`describe('MODULE_SECTIONS')`** — independently recomputes which enabled modules ship an `openapi.yaml` on disk and asserts `MODULE_SECTIONS` matches. Serves as a second computation that cannot be in the same circular import path as the bundler.
- **`describe('the OpenAPI bundle')`** — (1) parses each module's standalone `openapi.yaml` and asserts `openapi`, `paths`, and non-empty `components.schemas` are present; (2) parses the committed root bundle, collects all paths, and asserts every path is claimed by exactly one module section or falls into a hardcoded root list (`/`, `/.well-known/security.txt`, `/config`, `/livez`, `/readyz`).
- **`asyncDocument(name)`** — reads, parses, and type-casts a committed AsyncAPI bundle.
- **`describe.each(['asyncapi', 'asyncapi-public'])`** — (1) asserts every channel has ≥ 1 message resolvable in `components.messages`, and every operation's `$ref` resolves to an existing channel whose message list includes the referenced message; (2) asserts server/channel binding is mutual (no orphan servers, no channel without a server).

## Relationships

- **`scripts/contracts/bundle-registry.ts`** — source of `CONTRACT_BUNDLES`, `bundleFragments`, `isGenerated`, `readCommittedBundle`, and the `ContractBundle` type. The test's central data model.
- **`scripts/contracts/openapi-bundle.ts`** — provides `MODULE_SECTIONS` (the list of module names that contribute a section) and `moduleSpec` (resolves a section name to its file path on disk).
- **`scripts/contracts/client-collections-bundle.ts`** — provides `allProbes`, used when validating generated client collections in memory.
- **`scripts/pairing/spec-identity.ts`** — provides `SHARED_FILES`, the cross-repo guard list the test cross-checks against bundle `shared` flags.
- **`src/modules.ts`** — provides `enabledModules`, used in the independent `MODULE_SECTIONS` recomputation.
- **`scripts/modules-on-disk.ts`** — provides `REPO_ROOT` for all filesystem path construction.

## Notes

- **No byte-for-byte check here.** Committed bundles are `.gitignore`d and rebuilt by `postinstall`; equality against a fresh build is owned by `npm run check`. This file only validates structural content.
- **Generated bundles (client collections) are tested by running the generator**, not by comparing a committed copy—there is no committed copy to compare against.
- **Comments are not checked.** YAML parsing strips comments, and the file's docblock explicitly notes that comment placement is a design choice, not a testable invariant.
- **Circular-import avoidance:** The `MODULE_SECTIONS` test deliberately does not import module code, because modules import the generated `@api/` client that the bundler itself produces. This test is the independent second computation.
- **Root paths are a hardcoded list** (`/`, `/.well-known/security.txt`, `/config`, `/livez`, `/readyz`). Adding a new non-module route requires updating this assertion.
