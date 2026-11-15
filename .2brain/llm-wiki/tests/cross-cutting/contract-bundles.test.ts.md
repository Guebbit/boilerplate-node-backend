---
source: tests/cross-cutting/contract-bundles.test.ts
sha256: 41640637483f31fe5b03379fad806584701948fd52a8dcdbb5cf45091accf2be
generated_at: 2026-11-14T23:02:14.759169+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/contract-bundles.test.ts

## Purpose

Cross-cutting structural tests for the contract bundles that ship with the repo (OpenAPI, AsyncAPI, and generated client collections). Rather than asserting byte-for-byte equality of compiled outputs (that is `npm run check`'s job), these tests verify invariants of the *shape* and *internal consistency* of each bundle: that every module document is standalone-valid OpenAPI, that paths are attributed to exactly one module or the root, that AsyncAPI channels/messages/operations/servers cross-reference correctly, and that the shared-files guard and module-section list stay in lockstep with the rest of the codebase.

## Key elements

- **`counted`** – helper that tallies items across collection folder keys (`items` / `children`).
- **`bundleByName`** – resolves a `ContractBundle` from `CONTRACT_BUNDLES` by name; throws if absent.
- **`describe('every contract bundle')`** – asserts that every non-generated bundle's output path appears in `SHARED_FILES` exactly when `bundle.shared !== false`, tying the frontend cross-repo guard to the bundle registry.
- **`describe('MODULE_SECTIONS')`** – independently recomputes which enabled modules have an `openapi.yaml` on disk and asserts set-equality with `MODULE_SECTIONS` (catches a stale section after a module is disabled).
- **`describe('the OpenAPI bundle')`** – two tests: (1) every `MODULE_SECTIONS` entry parses as standalone OpenAPI with `paths` and at least one schema; (2) the union of per-module paths plus the known root routes exactly equals the committed bundle's `paths` map, with no duplicates.
- **`asyncDocument`** – helper that reads and parses a committed AsyncAPI bundle by name, returning a typed shape for channels, operations, and components.
- **`describe.each(['asyncapi','asyncapi-public'])`** – per-bundle structural checks: every channel has ≥1 message resolvable in `components.messages`; every operation's channel and messages resolve; every declared server is bound to at least one channel and vice-versa.
- **`describe('the public AsyncAPI bundle')`** – (truncated) SSE-channel-specific assertions for the public variant.

## Relationships

- **`scripts/contracts/bundle-registry.ts`** – source of `CONTRACT_BUNDLES`, `isGenerated`, `readCommittedBundle`, `assembleBundle`, and the `ContractBundle` type. The test iterates the registry and reads committed outputs via `readCommittedBundle`.
- **`scripts/contracts/openapi-bundle.ts`** – provides `MODULE_SECTIONS` (the list of module OpenAPI specs) and `moduleSpec` (path resolver). The test validates `MODULE_SECTIONS` and reads individual module docs.
- **`scripts/contracts/client-collections-bundle.ts`** – exports `allProbes`, imported here for the generated-bundle validation (collection contents are asserted in-memory rather than against a committed file).
- **`scripts/pairing/spec-identity.ts`** – provides `SHARED_FILES`, the cross-repo file list the test cross-checks against the bundle registry.
- **`src/modules.ts`** – provides `enabledModules`, the runtime truth the `MODULE_SECTIONS` test validates against.
- **`scripts/modules-on-disk.ts`** – provides `REPO_ROOT` used to resolve absolute file paths for `existsSync` / `readFileSync` calls.

## Notes

- The file explicitly does **not** re-test byte-for-byte freshness of compiled bundles; that responsibility belongs to `npm run check` (invoked via `postinstall`). Duplicating it here would be a second Jest case over the same two function calls.
- The `MODULE_SECTIONS` vs. `enabledModules` check exists because `openapi-bundle.ts` cannot import `enabledModules` directly: doing so would pull in module code that imports the generated `@api/` client, which the bundler itself must produce first. This test is the independent second computation.
- `asyncapi.yaml` must be **absent** from `SHARED_FILES` (not merely exempt): the frontend carries `asyncapi.public.yaml` instead, and an entry for the full bundle would incorrectly demand queue channels in the frontend.
- Generated bundles (e.g. Bruno collections) are validated by exercising the generator in memory rather than comparing a committed file, because the committed copies are `.gitignore`d and the meaningful invariant is "the generator still covers the contract."
- The file is truncated in the snapshot; the public AsyncAPI describe block and any further cases are not visible.
