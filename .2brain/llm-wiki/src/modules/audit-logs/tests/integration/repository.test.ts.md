---
source: src/modules/audit-logs/tests/integration/repository.test.ts
sha256: 02b88523503c4bc17d33d3abd924bb300e37877bcc8127369b05330050b52af1
generated_at: 2026-09-23T18:28:05.152183+00:00
model: ollama:qwen3.8:27b
---

# src/modules/audit-logs/tests/integration/repository.test.ts

## Purpose
Integration tests for `auditLogRepository` against an in-memory MongoDB. Verifies create/search semantics, filter combinations, pagination metadata, response shape, and guards against a regression where a capped read (max 200 rows) silently hid entries beyond row 200.

## Key elements
- **`makeEntry(overrides)`** – factory returning a fully-shaped `Partial<AuditLogDocument>` using only `coreAuditActions` values, so fixtures never depend on an optional domain module.
- **`search(filters, since?)`** – thin wrapper that calls `auditLogRepository.search` with the service-layer policy args (`sinceScope(since)`, `AUDIT_SORT`) explicitly, mirroring how the service layer invokes the base repository method.
- **`describe('create')`** – asserts all optional context fields round-trip; rejects entries missing required fields.
- **`describe('search')`** – covers unfiltered newest-first ordering, single-field filters (actor, action, outcome, target), exclusive `since` bound, filter composition (AND semantics), page-size vs. total-count distinction, `_id`/`__v` stripping, ISO-8601 timestamp serialization, and empty-result shape.
- **`describe('deep paging')`** – regression suite (205 entries): verifies page 21 of 10 returns the five oldest rows with correct `meta`, and that three 100-row pages partition the set without duplicates (relies on `_id` tiebreak in `AUDIT_SORT`).

## Relationships
- **`src/modules/audit-logs/repository.ts`** – system under test; imports `auditLogRepository` (create, search, sinceScope) and `AUDIT_SORT`.
- **`src/modules/audit-logs/model.ts`** – provides the `AuditLogDocument` type used by `makeEntry`.
- **`src/infrastructure/observability/audit.ts`** – provides `coreAuditActions` enum values used exclusively as fixture data and the `AuditEntry` type.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` seeds the in-memory MongoDB before any test runs.
- **`tests/support/stub.ts`** – `asStub` lets assertions inspect otherwise-typed-away fields (`_id`, `__v`) on returned items.

## Notes
- Fixtures use **only** `coreAuditActions` (the three security actions) so the spec compiles regardless of which domain modules are enabled; reaching for a domain action would create a compile-time dependency on an optional module.
- `since` must stay a `Date` — the repository's generic range spec coerces bounds with `Number()`, which would break Mongo comparison; passing it through `sinceScope` preserves the `Date` type.
- `AUDIT_SORT` includes `_id` as a tiebreaker; without it, bulk-written entries sharing a timestamp could produce non-deterministic page boundaries.
- The `deep paging` block is a targeted regression test: it fails against any implementation that caps the scan at 200 rows while still reporting the true total.
