---
source: src/modules/audit-logs/tests/integration/repository.test.ts
source_sha256: ac6d280dc99ea13c91d1c33812718fa4472d6deb8f816851965d8a6d20a9d0bb
context_sha256: 9d8bbd37fcfe2496ec292d433142b8638b03fe3c1b9f8e066e6dec44450469d9
generated_at: 2026-11-22T04:28:45.394504+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/audit-logs/tests/integration/repository.test.ts

## Purpose
Integration tests for `auditLogRepository`, run against the in-memory Mongo that `setupTestDb()` wires up. They cover appending entries, search and filter behaviour, deep paging beyond a 200-row cap, and (in the part of the file visible here) the cursor-paged `ownEntriesPage` and `auditLogService.search` with the `ownOrder` filter.

## Key elements
- `makeEntry(overrides)`: builds a complete `Partial<AuditLogDocument>` shaped like what `emitAuditEvent` hands the sink. It defaults to `user-1`, the `SECURITY_REAUTH_REQUIRED` action, outcome `success`, and a fixed 2026-08-01 timestamp.
- `search(filters, since?)`: wrapper around `auditLogRepository.search(filters, auditLogRepository.sinceScope(since), AUDIT_SORT)`. It passes `since` and the sort explicitly because those are service-level policy.
- `describe('create')`: tests storing every optional context field, keeping `actorCredentialId` through to search, and rejecting an entry with missing required fields.
- `describe('search')`: seeds three entries and tests the following:
  - newest-first ordering
  - filters by actor, action, outcome and target, and combinations of them
  - `since` as an exclusive lower bound that stays a `Date`
  - `totalItems` counting all matches while only one page is returned
  - dropped `_id` and `__v`, with `timestamp` returned as an ISO-8601 string
  - an empty result
- `describe('deep paging')`: seeds 205 entries a minute apart. It checks that page 21 of size 10 returns rows 201–205 with `totalPages: 21`, and that no entry appears on two pages.
- `walk(actor, limit)`: helper that follows `ownEntriesPage` through its `next` cursor, collecting `requestId`s and the page count.
- `targetsOf(items)`: helper returning the sorted `targetId`s of a page.
- `describe('auditLogService.search — the ownOrder filter')`: begins seeding entries with `metadata.ownOrder`. The rest of its body is not shown here.

## Relationships
- `@modules/audit-logs/repository`: the subject under test (`auditLogRepository`, `AUDIT_SORT`, `sinceScope`, `create`, `search`, `ownEntriesPage`).
- `@modules/audit-logs/service`: imports `auditLogService` and `OWN_ENTRIES_PAGE`, used in the service-level section.
- `@infrastructure/observability/audit`: supplies `coreAuditActions` and the `AuditEntry` type used for fixtures.
- `@modules/audit-logs/model`: supplies the `AuditLogDocument` type for the fixture shape.
- `@modules/audit-logs/config`: imports `auditLogsConfig`.
- `@tests/setup-test-db`: `setupTestDb()` is called at module level to provide the in-memory database.
- `@tests/stub`: `asStub` casts partial or loose objects, for example an incomplete entry and the raw result record.
- `tests/support/spec-arbitraries.ts`: a graph neighbour, but it is not used in the visible portion.

## Notes
- All fixtures use `coreAuditActions` rather than domain actions. The action vocabulary is assembled from the enabled modules, so core's security actions are the only ones guaranteed to exist in every build.
- The deep-paging tests guard against a regression where the read was capped at 200 rows but still reported the true total. `AUDIT_SORT` adds `_id` as a tiebreaker so that pages never overlap.
- `since` travels through `scope` rather than the search filters because the search spec's ranges coerce bounds with `Number()`, which would break a `Date`.
- The `since` bound is exclusive (`>`), matching the ring buffer's behaviour.
