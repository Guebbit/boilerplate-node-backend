# src/modules/locales/tests/unit/service.test.ts

## Purpose

Unit tests for the pure, stateless functions in `localeService` — the message-tree builder, key-collision detectors, and the capability-manifest merge. These functions make decisions (not I/O) and fail silently when wrong, so they are asserted here directly rather than through the repository or HTTP layers.

## Key elements

- **`language(overrides)`** – Local helper that returns a minimal `LocaleDocument` with only the five fields `mergeCapabilities` reads, filling in defaults (`active: true`, `direction: ltr`, `revision: 0`).
- **`describe('buildMessageTree')`** – Verifies flat dotted-key → nested-object expansion, deep nesting, empty input, single-key case, collision throws (both insertion orders), and that a stored `__proto__` segment cannot pollute `Object.prototype`.
- **`describe('findKeyCollision')`** – Asserts ancestor/descendant detection, that shared prefixes without a segment boundary (`a.bc` vs `a.b`) are *not* collisions, and that an identical key is a duplicate, not a collision.
- **`describe('findBatchCollision')`** – Confirms two keys in the same batch can collide with each other before either is written.
- **`describe('findDuplicateKey')`** – Names the repeated key in a batch; returns `undefined` for distinct keys.
- **`describe('findUnsafeKeySegment')`** – Rejects `__proto__`, `constructor`, `prototype`, and empty segments (`a..b`, leading/trailing dot); accepts ordinary keys.
- **`describe('mergeCapabilities')`** – Validates the manifest-row shape for static-only, dynamic-only, and both-tier languages; checks tenant assignment, `entryCount`, `revision`, `active` passthrough, display-name fallback from the stored row, tag-sorted output, and zero-entry default.
- **`describe('isRightToLeft')`** – Confirms RTL detection for `ar`/`he`/`fa` (including region tags like `ar-EG`) and LTR for everything else.
- **`describe('describeLanguage')`** – Tests English vs. native naming and the tag-as-fallback when ICU cannot resolve a tag (no throw, no 500).

## Relationships

- **`../../services` (`src/modules/locales/services/index.ts`)** – The system under test; every assertion calls a method on the re-exported `localeService`.
- **`./tenants.fixture` (`src/modules/locales/tests/unit/tenants.fixture.ts`)** – Supplies the `BACKEND` and `FRONTEND` enum values used in `mergeCapabilities` expectations.
- **`../../model` (`src/modules/locales/model.ts`)** – Provides the `LocaleDocument` type used by the `language()` helper.
- **`@types` (`src/types/index.ts`)** – Provides `LocaleDirection` and `LocaleSource` enums used in both the helper and the assertions.

## Notes

- **Two-order collision tests are deliberate.** A bug that silently drops a key would be order-dependent and invisible to a single-order test; both insertion orders are asserted separately.
- **`findKeyCollision` uses dot-boundary comparison, not `startsWith`.** The `a.bc` vs `a.b` case is the reason; appending `.` to the candidate is the guard.
- **The `__proto__` tree test is defense-in-depth.** Write-time validation (`findUnsafeKeySegment`) is the primary gate; this test covers rows that bypassed it (migrations, raw mongosh inserts, pre-check imports).
- **`mergeCapabilities` output is always tag-sorted.** This keeps manifest diffs minimal — two manifests differ only where content actually changed.
- **Scope boundary:** write-path behavior (Mongo round-trips) is covered in `repository.test.ts`; HTTP contract behavior lives in the contract suite. This file intentionally stops at the pure decision layer.
