# src/modules/locales/tests/unit/service.test.ts

## Purpose

Unit tests for the pure, decision-making half of `localeService`: the message-tree builder, key-collision detectors, and the capability-manifest merge. These functions fail silently when wrong (dropped keys, mis-claimed capabilities), so they are asserted directly here rather than through integration paths (Mongo in `repository.test.ts`, HTTP in the contract suite).

## Key elements

- **`language(overrides)`** — local factory that builds a minimal `LocaleDocument` with sensible defaults (`ltr`, `revision: 0`, `active: true`) for the `mergeCapabilities` tests.
- **`describe('buildMessageTree')`** — asserts nested-object expansion from flat dotted keys, empty-input handling, arbitrary depth, collision throws (both insertion orders), and `__proto__` pollution resistance.
- **`describe('findKeyCollision')`** — asserts ancestor/descendant detection, that shared *prefixes* without a dot boundary are not ancestors, and that identical keys (duplicates) are excluded.
- **`describe('findBatchCollision')`** — catches pairs that collide only within the same uncommitted batch.
- **`describe('findDuplicateKey')`** — identifies repeated keys in a key list.
- **`describe('findUnsafeKeySegment')`** — rejects `__proto__`, `constructor`, `prototype`, and empty segments (`a..b`, `a.`, `.a`).
- **`describe('mergeCapabilities')`** — covers static-only, dynamic-only, and dual-tier rows; active-flag passthrough for admin manifests; display-name override from the stored row; tag-sorted output; zero-entry fallback.
- **`describe('isRightToLeft')`** — RTL detection for base and region tags.
- **`describe('describeLanguage')`** — English vs. native naming, and graceful fallback to the raw tag on unknown languages.

## Relationships

- **`src/modules/locales/services/index.ts`** — the module under test; all assertions call methods on `localeService` exported here.
- **`src/modules/locales/tests/unit/tenants.fixture.ts`** — provides the `BACKEND` / `FRONTEND` sentinel values used in `mergeCapabilities` expectations.
- **`src/modules/locales/model.ts`** — supplies the `LocaleDocument` type used by the `language()` helper.
- **`src/types/index.ts`** — supplies `LocaleDirection` and `LocaleSource` enum values referenced in test expectations.

## Notes

- The module docstring explicitly frames these tests as covering *decisions* that "fail silently when wrong," which is why they are isolated from the DB/HTTP integration suites.
- `buildMessageTree` collision tests assert **both** insertion orders to guarantee the throw is order-independent (separate code branches: leaf-then-group vs. group-then-leaf).
- The `__proto__` test documents a *second line of defense*: write-time validation via `findUnsafeKeySegment` is primary; the tree builder's safe property assignment is the fallback for rows that arrived via migration, `mongosh`, or a pre-check import.
- `mergeCapabilities` expects output **sorted by tag**, which is an intentional contract so that two manifests differ only when content actually changes.
