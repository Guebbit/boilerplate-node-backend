# tests/cross-cutting/contract-bundles.test.ts

## Purpose

Cross-cutting tests that verify every contract bundle (OpenAPI, AsyncAPI, API client collections) is a faithful product of its authored source fragments. It guards two distinct invariants: committed bundles must equal a fresh build (byte-for-byte, enforced by `check:contracts-bundle --check` and asserted here only for structural properties), and generated bundles must be reproducible in memory with correct content coverage.

## Key elements

- **`AUTHORED_BUNDLES`** — derived array: all `CONTRACT_BUNDLES` entries where `isGenerated` is false (i.e., everything except the four API client collections).
- **`counted(groups)`** — small helper that counts request items across folder structures regardless of whether the tool nests them under `items` or `children`.
- **`bundleByName(name)`** — lookup into `CONTRACT_BUNDLES` by name; throws if absent.
- **`asyncDocument(name)`** — reads and YAML-parses a committed AsyncAPI bundle, returning a typed shape for `servers`, `channels`, and `components`.
- **`describe('every contract bundle')`** — asserts every authored fragment is non-empty (canary for silent zero-length sources) and that the `SHARED_FILES` cross-repo guard aligns with `bundle.shared` flags.
- **`describe('the OpenAPI bundle')`** — asserts each `MODULE_SECTIONS` entry is a standalone OpenAPI doc with paths and schemas, and that all documented paths partition exactly across modules + root (`/`).
- **`describe.each([['asyncapi'], ['asyncapi-public']])`** — for both bundles: every channel operation that references a message resolves to a key in `components.messages`; every declared server is bound by at least one channel and vice-versa.
- **`describe('the public AsyncAPI bundle')`** — asserts the public bundle contains exactly the non-`worker.`-prefixed channels of the full bundle, and that every channel/server/message in the public bundle is deep-equal to its full-bundle counterpart.
- **`describe('the API client collections')`** — builds each generated bundle in memory via `assembleBundle` (once, shared across cases) and validates the produced documents (content truncated in source).

## Relationships

- **`scripts/contracts/bundle-registry.ts`** — primary source of the bundle metadata (`CONTRACT_BUNDLES`, `REPO_ROOT`), the fragment resolver (`bundleFragments`), the in-memory assembler (`assembleBundle`), the committed-file reader (`readCommittedBundle`), and the `isGenerated` / `ContractBundle` types. Every test case in this file operates through these exports.
- **`scripts/contracts/openapi-bundle.ts`** — provides `MODULE_SECTIONS` (the set of module spec filenames) and `moduleSpec(section)` (path to a module's standalone OpenAPI doc), used to verify per-module document integrity and path partitioning.
- **`scripts/contracts/client-collections-bundle.ts`** — provides `allProbes`, the set of request probes that the generated client collections must cover.
- **`scripts/spec-identity.ts`** — provides `SHARED_FILES`, the cross-repo identity list that the "shared files" test cross-references against `bundle.shared` flags.
- **`scripts/contracts/bundle-kinds.ts`** — transitive dependency via `bundle-registry.ts`; defines the kind taxonomy (`compiled` vs `generated`) that `isGenerated` dispatches on.

## Notes

- The byte-for-byte "committed file equals fresh build" check is deliberately **not** duplicated as a Jest case here; it lives in `check:contracts-bundle --check` (run on every CI). This file only asserts structural and content-coverage properties that Jest is well-suited to express.
- The shared-files test reads membership from `SHARED_FILES` and `bundle.shared` flags rather than hard-coding filenames, so adding a new bundle does not silently drop out of the cross-repo guard.
- The comment-preservation guarantee (that compiled bundles carry no comments) is explicitly **not** tested here — the file's header notes this is a placement design choice, not a fork-prevention invariant.
- Generated bundles are `.gitignore`d; the test block builds them once via `assembleBundle` into a `Map` and shares that across cases to avoid re-walking every module contract per assertion.
