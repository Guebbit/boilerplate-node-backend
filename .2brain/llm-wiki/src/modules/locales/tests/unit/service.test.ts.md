---
source: src/modules/locales/tests/unit/service.test.ts
sha256: cae75ee46b58d86ed22396951328b64f2bc00129cd4237b1d80f003960743a42
generated_at: 2026-09-23T18:54:43.875423+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/tests/unit/service.test.ts

## Purpose

Unit tests for the pure decision logic in `localeService`: the message-tree builder, key-collision detection, batch validation, unsafe-segment guarding, capability merging, RTL detection, and language naming. These functions fail silently (dropped keys, phantom capabilities) rather than throwing at the DB layer, so they are asserted here in isolation; the write paths that call them are covered by `repository.test.ts` and the HTTP contract suite.

## Key elements

- **`language(overrides)`** — local helper that fabricates a minimal `LocaleDocument` with the five fields `mergeCapabilities` reads, filled by the caller's overrides.
- **`describe('buildMessageTree')`** — asserts flat dotted keys expand into nested objects, empty input yields `{}`, deep nesting works, conflicting leaf/group pairs throw regardless of insertion order, and a `__proto__` segment becomes an ordinary property (prototype-pollution guard).
- **`describe('findKeyCollision')`** — verifies ancestor-vs-descendant collision detection, that shared prefixes without a dot boundary are *not* collisions, and that identical keys (duplicates) are excluded.
- **`describe('findBatchCollision')`** — confirms intra-batch pairs are caught before either row is written; consistent batches pass.
- **`describe('findDuplicateKey')`** — checks that a repeated key in a batch is named; distinct keys yield `undefined`.
- **`describe('findUnsafeKeySegment')`** — asserts `__proto__`, `constructor`, `prototype`, and empty segments (e.g. `a..b`) are all refused; ordinary keys pass.
- **`describe('mergeCapabilities')`** — the largest block. Covers static-only, dynamic-only, and both-tier rows; tenant assignment (`BACKEND`/`FRONTEND`); `active` flag passthrough for admin manifests; display-field fallback from stored row; stable tag ordering; and zero-entry counting.
- **`describe('isRightToLeft')`** — RTL tags (`ar`, `he`, `fa`) and region tags (`ar-EG`) resolve correctly; LTR tags do not.
- **`describe('describeLanguage')`** — English-name and self-name lookups; unresolvable tags fall back to the tag string rather than throwing.

## Relationships

- **`src/modules/locales/services/index.ts`** — the SUT; `localeService` is imported and every assertion calls one of its methods.
- **`src/modules/locales/services/capabilities.ts`** — likely the implementation module behind the re-exported service methods under test (graph-level dependency; not imported directly by this file).
- **`src/modules/locales/model.ts`** — provides the `LocaleDocument` type used to shape the `language()` fixture.
- **`src/types/index.ts`** — source of `LocaleDirection` and `LocaleSource` enum values asserted throughout.
- **`src/modules/locales/tests/unit/tenants.fixture.ts`** — supplies the `BACKEND` and `FRONTEND` sentinel values used in `mergeCapabilities` expectations.
- **`scenarios/locales.ts`** — graph neighbor; likely the integration/scenario fixture that exercises these same service functions end-to-end (no direct import here).

## Notes

- The file deliberately tests **pure logic only** — no database, no HTTP. The module doc-block states that write paths are driven through Mongo (`repository.test.ts`) and HTTP (contract suite), so coverage here is the "silent-failure" layer that would otherwise be invisible.
- Collision tests assert **both insertion orders** (leaf-then-group and group-then-leaf) because the two branches are separate code paths; a single-order test would miss a regression in the other branch.
- `findKeyCollision` uses a **dot-boundary** check (appending `.` before `startsWith`), not a bare prefix match — the test for `a.bc` vs `a.b` exists specifically to pin that behavior.
- The `__proto__` test asserts the key is *present* as an ordinary property (`tree.__proto__` equals `{ polluted: 'yes' }`) **and** that the global `Object.prototype` is untouched. This is a defence-in-depth check against rows that bypassed write-time validation.
- `mergeCapabilities` ordering is asserted to be **by tag (lexicographic)**, not by insertion order — manifests are compared for diff, so stability matters.
- `describeLanguage` has a documented failure mode: an ICU build without locale data returns the tag string rather than throwing. Tests lock in that "graceful degradation" contract.
