---
source: tests/cross-cutting/contract-bundles.test.ts
sha256: 6d9265f1d909633722f7b7255f5d017d9d8929dbc2f6c75707a11baf232d79af
generated_at: 2026-09-23T19:54:48.088405+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/contract-bundles.test.ts

## Purpose

Cross-cutting test suite that validates the structural integrity of every contract bundle (OpenAPI, AsyncAPI, and API client collections) from the perspective of the *sources* and *registry* rather than a single module. It asserts invariants that no individual source file can check on its own: fragment completeness, shared-file alignment, path ownership, channel/message/operation reachability, and server-channel binding. It exists as the single place where the whole-bundle shape is pinned without duplicating the byte-for-byte regeneration check that `check:contracts-bundle --check` already performs in CI.

## Key elements

- **`counted`** — counts items across collection folders, handling both `items` and `children` nesting keys used by different export tools.
- **`bundleByName`** — looks up a `ContractBundle` entry from `CONTRACT_BUNDLES` by name; throws if absent.
- **`AUTHORED_BUNDLES`** — `CONTRACT_BUNDLES` filtered to exclude generated (client-collection) bundles; the set that has a committed file on disk.
- **`describe('every contract bundle')`** — two cases: every fragment resolves to a non-empty file (canary against silent empty resolution), and the `shared` flag on each authored bundle agrees with `SHARED_FILES` (a `shared === false` entry must be *absent* from the cross-repo guard, not merely allowed).
- **`describe('MODULE_SECTIONS')`** — asserts `MODULE_SECTIONS` equals exactly the enabled modules that ship their own `openapi.yaml`; lives here (not in the bundler) because `enabledModules` pulls in generated `@api/` client code, creating a circular import if checked from `openapi-bundle.ts`.
- **`describe('the OpenAPI bundle')`** — validates that each module section is a standalone OpenAPI document (has `paths` and `components.schemas`), and that the union of module paths plus the root path `GET /` exactly equals the bundled path set with no overlaps.
- **`asyncDocument`** — parses a committed AsyncAPI bundle via `readCommittedBundle` and returns a typed shape for channel/operation/message assertions.
- **`describe.each([['asyncapi'], ['asyncapi-public']])`** — two cases per bundle: (1) every channel has at least one message that resolves in `components.messages`, and every operation's channel and messages resolve to that channel's own messages; (2) every server is bound to at least one channel and every channel is bound to at least one server.

## Relationships

- **`scripts/contracts/bundle-registry.ts`** — primary import source: `CONTRACT_BUNDLES`, `bundleFragments`, `isGenerated`, `readCommittedBundle`, `REPO_ROOT`, and the `ContractBundle` type. The registry defines *what* exists; this file asserts *that it is well-formed*.
- **`scripts/contracts/openapi-bundle.ts`** — provides `MODULE_SECTIONS` (the section list) and `moduleSpec` (resolves a section name to its YAML file path). This test validates the list's completeness and each section's standalone validity.
- **`scripts/contracts/client-collections-bundle.ts`** — provides `allProbes` (imported but not exercised in the visible truncated portion; presumably used by the client-collection generator assertions below the cut).
- **`scripts/pairing/spec-identity.ts`** — provides `SHARED_FILES`, the cross-repo contract of which backend files the frontend also carries. This test cross-checks that set against each bundle's `shared` flag.
- **`src/modules.ts`** — provides `enabledModules`, the runtime module registry. Used to derive the expected `MODULE_SECTIONS` list from the actual enabled modules on disk.

## Notes

- **Test ordering / codegen dependency:** this file imports `enabledModules` from `src/modules.ts`, which transitively imports the generated `@api/` client. The bundler (`openapi-bundle.ts`) must run *before* codegen, so this check cannot live there. The cross-cutting test runs *after* codegen, which is why it is the correct home for the `MODULE_SECTIONS` ↔ `enabledModules` assertion.
- **No byte-for-byte comparison here:** the committed-bundle regeneration check (`file on disk === fresh build`) is asserted by `check:contracts-bundle --check` in CI's `complete` phase. Duplicating it as a Jest case would run the same two function calls twice.
- **Client collections are git-ignored:** they have no committed copy to diff against. The relevant property is the *generator's* output, tested in-memory.
- **Comments are not a tested property:** YAML parsing drops comments, and all compiled bundles are parsed. The file explicitly notes that a comment count is indistinguishable from noise and was never a real fork guard; explanations live in the module source files instead.
- **`asyncapi.yaml` vs `asyncapi.public.yaml`:** the public bundle is the one the frontend receives; the full `asyncapi.yaml` must be *absent* from `SHARED_FILES`, not merely tolerated. An entry for it would incorrectly demand the frontend carry internal queue channels.
