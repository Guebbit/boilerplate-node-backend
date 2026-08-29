# tests/cross-cutting/contract-bundles.test.ts

## Purpose

Validates that every contract bundle in the registry is structurally consistent and internally coherent. For compiled (committed) bundles it checks that source fragments are non-empty and that the assembled document partitions its content correctly (OpenAPI paths, AsyncAPI channels/servers/messages). For generated bundles it verifies the generator output directly, since no committed copy exists to diff against. It also enforces the boundary between the full AsyncAPI contract and the public subset that the frontend consumes.

## Key elements

- **`AUTHORED_BUNDLES`** — `CONTRACT_BUNDLES` filtered to exclude generated bundles; the set subject to fragment and shared-file checks.
- **`counted(groups)`** — helper that tallies request items under a folder's `items` or `children` key (Postman/Insomnia-agnostic).
- **`bundleByName(name)`** — looks up a `ContractBundle` by name from the registry; throws if missing.
- **`asyncDocument(name)`** — reads and YAML-parses a committed AsyncAPI bundle, returning a typed shape of `servers`, `channels`, and `components`.
- **`describe('every contract bundle')`** — (1) every fragment file is non-empty after trim; (2) each non-generated bundle's output path appears in (or is correctly absent from) `SHARED_FILES` based on its `shared` flag.
- **`describe('the OpenAPI bundle')`** — (1) every module section file is a standalone OpenAPI document with `openapi`, `paths`, and `components.schemas`; (2) the union of module paths plus the root (`/`) equals the committed bundle's paths with no duplicates.
- **`describe.each(['asyncapi', 'asyncapi-public'])('the %s bundle')`** — (1) every channel operation's `$ref` resolves to a known message in `components.messages`; (2) the set of servers declared equals the set referenced by channels (no orphan servers, no unbound channels).
- **`describe('the public AsyncAPI bundle')`** — (1) contains exactly the non-`worker.*` channels from the full bundle; (2) every channel, server, and message in the public bundle is a deep-equal subset of the full bundle.
- **`describe('the analytics event bundle')`** — (truncated) asserts no two `ANALYTICS_SECTIONS` declare the same event name and that the committed bundle's event set matches `analyticsEvents` from the frontend source.

## Relationships

| Neighbor | Interaction |
|---|---|
| `scripts/contracts/bundle-registry.ts` | Primary source: imports `CONTRACT_BUNDLES`, `isGenerated`, `bundleFragments`, `assembleBundle`, `readCommittedBundle`, `REPO_ROOT`, and the `ContractBundle` type. The test iterates over the registry's declared bundles. |
| `scripts/contracts/openapi-bundle.ts` | Imports `MODULE_SECTIONS` and `moduleSpec` to locate and parse each standalone module YAML file. |
| `scripts/contracts/analytics-events-bundle.ts` | Imports `ANALYTICS_SECTIONS` to enumerate the source fragments the analytics bundle is spliced from. |
| `scripts/contracts/client-collections-bundle.ts` | Imports `allProbes` (used in the truncated generated-collection assertions). |
| `scripts/spec-identity.ts` | Imports `SHARED_FILES` to cross-check which bundle outputs must appear in the cross-repo shared-files guard. |
| `src/infrastructure/observability/analytics-events.frontend.ts` | Imports `analyticsEvents` (the verbatim event-name array) to compare against the analytics bundle's content. |
| `src/infrastructure/observability/analytics/index.ts` | Imports the `AnalyticsEventName` type for type-level consistency of the analytics assertions. |

## Notes

- The file intentionally does **not** re-assert the byte-for-byte committed-vs-fresh-build check that `check:contracts-bundle --check` already enforces on every CI run; the header comment calls this out explicitly to prevent a second Jest case duplicating the same two function calls.
- The "shared files" test reads `SHARED_FILES` and each bundle's `shared` flag rather than hard-coding file names, so adding a new bundle is self-guarding: it will fail if the new bundle is neither listed in `SHARED_FILES` nor marked `shared: false`.
- The public-AsyncAPI test asserts `worker.*` channels are **absent** (not merely "different"), because a leaked queue channel would imply the frontend must implement publish/subscribe for a transport it cannot reach.
- `asyncDocument` re-parses the committed file on each call; there is no caching. The test suite is small enough that this is intentional simplicity.
- The analytics bundle is spliced from verbatim line slices (not YAML-parsed) because its source declarations carry comments that no parser preserves; this is why the "comment placement" concern in the header only applies to that one bundle.
