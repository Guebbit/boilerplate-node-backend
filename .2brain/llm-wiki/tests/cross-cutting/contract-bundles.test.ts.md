---
source: tests/cross-cutting/contract-bundles.test.ts
sha256: 29dafc50752203bf6fb6a14ec51803e3d003b1c132374413b156d29aec7c50b5
generated_at: 2026-10-29T06:44:29.858257+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/contract-bundles.test.ts

## Purpose

Cross-cutting test suite that verifies the integrity of every contract bundle in the repo. For compiled bundles (OpenAPI, AsyncAPI) it checks that fragments are non-empty, that the committed AsyncAPI documents resolve all internal `$ref`s, and that the module-section list stays in sync with `enabledModules`. For generated bundles (API client collections) it asserts the generator produces a valid document in memory rather than comparing against a committed file. The goal is to catch a silently drifting contract before it forks the two sides of a shared API.

## Key elements

- **`AUTHORED_BUNDLES`** — `CONTRACT_BUNDLES` filtered to non-generated entries; the set every "committed bundle" assertion iterates over.
- **`counted(groups)`** — small helper that sums `items` or `children` across Postman-style folder arrays.
- **`bundleByName(name)`** — looks up a `ContractBundle` in the registry or throws; used to fetch `openapi` and the two AsyncAPI bundles by name.
- **`asyncDocument(name)`** — parses a committed AsyncAPI bundle via `readCommittedBundle` and returns a typed shape exposing `channels`, `operations`, and `components.messages`.
- **`describe('every contract bundle')`** — asserts every fragment file is non-empty (canary for a silently blank domain half) and that the shared-files guard set matches the registry's `shared` flag.
- **`describe('MODULE_SECTIONS')`** — recomputes which enabled modules ship their own `openapi.yaml` on disk and asserts set-equality with `MODULE_SECTIONS`.
- **`describe('the OpenAPI bundle')`** — verifies each module document is standalone-valid OpenAPI (has `openapi`, `paths`, non-empty `components.schemas`) and that the union of module paths plus the four system routes (`/`, `/livez`, `/readyz`, `/.well-known/security.txt`) covers the bundle's paths with no overlap.
- **`describe.each(['asyncapi', 'asyncapi-public'])`** — for each bundle: every channel has ≥ 1 message, every message `$ref` resolves into `components.messages`, every operation's channel `$ref` resolves to a real channel, and every operation message `$ref` is scoped under that channel's messages.
- **Client-collection probes** (truncated section) — builds each collection in memory via `allProbes` and checks structural invariants (folder/request counts).

## Relationships

- **`scripts/contracts/bundle-registry.ts`** — primary source of `CONTRACT_BUNDLES`, `bundleFragments`, `isGenerated`, `readCommittedBundle`, and the `ContractBundle` type. The test is the consumer-side validation of the registry's invariants.
- **`scripts/contracts/openapi-bundle.ts`** — provides `MODULE_SECTIONS` and `moduleSpec(section)` (the fragment path). The test cross-checks `MODULE_SECTIONS` against `enabledModules` because the bundler itself cannot do so (circular: bundler → codegen → module code → bundler).
- **`scripts/contracts/client-collections-bundle.ts`** — exports `allProbes`, the in-memory builder the test calls to generate and inspect each client collection.
- **`scripts/contracts/bundle-kinds.ts`** — defines the kind/shape metadata the registry exposes; consumed indirectly through `ContractBundle`.
- **`scripts/pairing/spec-identity.ts`** — provides `SHARED_FILES`, the cross-repo guard list. The test asserts the registry's `shared` flag agrees with this list for every non-generated bundle.
- **`src/modules.ts`** — exports `enabledModules`; the test uses it as the independent ground-truth for which modules should appear in `MODULE_SECTIONS`.
- **`scripts/modules-on-disk.ts`** — exports `REPO_ROOT`, the filesystem anchor for all `readFileSync`/`existsSync` calls.

## Notes

- **No freshness assertion here by design.** `openapi.yaml` is gitignored and rebuilt by `postinstall`; the `contracts-bundle-freshness` CI job's `git diff` is the actual guard. Duplicating it as a Jest case would re-test the same two function calls without adding signal.
- **Comments are intentionally absent from all bundles.** Parsing drops them, and the design places explanations in the module source files instead. The test does *not* (and deliberately cannot) assert comment presence.
- **The shared-files test reads flags, not names.** It derives the expected set from `SHARED_FILES` + the registry's `shared`/`generated` fields so that adding a new bundle requires no edit here.
- **`MODULE_SECTIONS` check is the "second, independent computation."** `openapi-bundle.ts` validates against disk at build time but cannot import `enabledModules` (would create a circular dependency through generated API clients). This test closes that gap.
- **Path-partition test hardcodes the four system routes.** These live in `src/app/system-routes.ts`; any new root-level route must be added to the expected array or the test fails.
