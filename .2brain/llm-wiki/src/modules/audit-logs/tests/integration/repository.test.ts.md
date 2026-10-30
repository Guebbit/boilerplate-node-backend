---
source: src/modules/audit-logs/tests/integration/repository.test.ts
sha256: e29ae2b300b2cba89efb6921d85f5ae65e5596b9964c8091460e1c7a81627213
generated_at: 2026-10-29T03:19:09.739814+00:00
model: ollama:qwen3.8:27b
---

# src/modules/audit-logs/tests/integration/repository.test.ts

## Purpose

Integration tests for `auditLogRepository` (and one service-level filter) executed against an in-memory MongoDB instance. Verifies create, search-with-filters, pagination semantics, deep-paging correctness, and the `ownOrder` filter — guarding against regressions like capped reads and `Number()`-coerced date bounds.

## Key elements

- **`makeEntry(overrides)`** — Fixture factory returning a fully-shaped `Partial<AuditLogDocument>` using `coreAuditActions.SECURITY_UNAUTHORIZED` as the default action.
- **`search(filters, since?)`** — Local helper that calls `auditLogRepository.search` with an explicit `sinceScope(since)` and `AUDIT_SORT`, because the repository exposes the base (policy-free) `search`.
- **`walk(actor, limit)`** — Pages through `auditLogRepository.ownEntriesPage` until `next` is exhausted, collecting `requestId`s; simulates the export path.
- **`targetsOf(items)`** — Returns a sorted array of `targetId` values for order-independent assertions.
- **`describe('auditLogRepository' > 'create')`** — Verifies optional context fields round-trip, `actorCredentialId` is stored, and required-field validation rejects incomplete entries.
- **`describe('auditLogRepository' > 'search')`** — Covers unfiltered ordering (newest-first), single and combined filters (actor, action, outcome, target), exclusive `since` bound, Date-vs-Number coercion, page-vs-total distinction, `_id`/`__v` stripping, ISO-8601 `timestamp`, and empty results.
- **`describe('auditLogRepository' > 'deep paging')`** — Seeds 205 rows; asserts page 21 of 10 returns the five oldest entries and that three concurrent 100-row pages cover all 205 with no duplicates.
- **`describe('auditLogService.search — the ownOrder filter')`** — Service-level test: `ownOrder: true` keeps only entries flagged with `metadata.ownOrder`; other values pass through or exclude accordingly.

## Relationships

- **`src/modules/audit-logs/repository.ts`** — System under test. Imports `auditLogRepository`, `AUDIT_SORT`, and `sinceScope`.
- **`src/modules/audit-logs/service.ts`** — Secondary SUT for the `ownOrder` describe block. Imports `auditLogService`, `OWN_ENTRIES_PAGE`.
- **`src/modules/audit-logs/model.ts`** — Provides the `AuditLogDocument` type used in fixtures and assertions.
- **`src/infrastructure/observability/audit.ts`** — Source of `coreAuditActions` (the action enum) and the `AuditEntry` type for `makeEntry`.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises the in-memory Mongo instance at module load.
- **`tests/support/stub.ts`** — `asStub` casts a typed item to `Record<string, unknown>` for negative key-presence checks (`_id`, `__v`).

## Notes

- Fixtures deliberately use only `coreAuditActions` (security actions), never domain-specific actions, so the test compiles regardless of which feature modules are enabled.
- `since` is threaded through `scope` (not the generic `search` spec) specifically to keep it a `Date`; the generic path coerces bounds with `Number()`, which produces a value Mongo cannot compare against a stored `Date`.
- `AUDIT_SORT` includes `_id` as a tiebreaker because `timestamp` is not guaranteed unique across bulk inserts; without it, two concurrent pages could disagree on tie order.
- The deep-paging block encodes the invariant "a trail that counts what it cannot serve is not a trail" — any implementation that caps the read at a fixed row count while still reporting the true total will fail these tests.
