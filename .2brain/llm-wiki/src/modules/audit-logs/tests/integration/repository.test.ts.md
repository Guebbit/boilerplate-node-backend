---
source: src/modules/audit-logs/tests/integration/repository.test.ts
sha256: 5c45a464f30d808ff919a49eea71659135ec4e8a8beaddba66b79d1ef66f99a9
generated_at: 2026-11-14T19:26:06.729495+00:00
model: ollama:qwen3.8:27b
---

# src/modules/audit-logs/tests/integration/repository.test.ts

## Purpose

Integration tests for `auditLogRepository` (and one service-level query) executed against an in-memory Mongo instance provided by `setupTestDb`. Covers document creation, filter/sort/paging behavior, the `since` lower-bound semantics, a deep-paging regression guard, and the `ownOrder` metadata filter exposed through `auditLogService.search`.

## Key elements

- **`makeEntry(overrides?)`** – Builds a fully-populated `Partial<AuditLogDocument>` using `coreAuditActions` so every fixture compiles regardless of which feature modules are enabled.
- **`search(filters?, since?)`** – Local wrapper around `auditLogRepository.search` that injects `auditLogRepository.sinceScope(since)` and `AUDIT_SORT` explicitly, mirroring what the service layer does.
- **`walk(actor, limit)`** – Pages through `auditLogRepository.ownEntriesPage` using the cursor (`next`) the same way the export endpoint does; returns all collected `requestId`s and the page count.
- **`describe('auditLogRepository')`** – Main suite with three sub-blocks:
  - `create` – persistence of optional context fields, `actorCredentialId` round-trip, rejection of incomplete documents.
  - `search` – unfiltered ordering, single/multi-field filters, `since` as exclusive lower bound, `Date`-vs-`Number()` coercion guard, page/total meta accuracy, `_id`/`__v` stripping and ISO-8601 timestamp, empty-result shape.
  - `deep paging` – 205 entries seeded; asserts that page 21 (rows 201–205) is actually served and that three overlapping 100-row pages contain no duplicates.
- **`describe('auditLogService.search — the ownOrder filter')`** – Verifies that `ownOrder: true` in `metadata` narrows results to flagged entries only.

## Relationships

- **`src/modules/audit-logs/repository.ts`** – Primary subject under test; imports `auditLogRepository` and `AUDIT_SORT`.
- **`src/modules/audit-logs/service.ts`** – Imported for `auditLogService` (ownOrder filter test) and the `OWN_ENTRIES_PAGE` constant.
- **`src/infrastructure/observability/audit.ts`** – Provides `coreAuditActions` and the `AuditEntry` type used to shape fixtures.
- **`src/modules/audit-logs/model.ts`** – Supplies the `AuditLogDocument` type for the fixture helper.
- **`src/modules/audit-logs/config.ts`** – Imports `auditLogsConfig` (referenced in the file's import list).
- **`tests/support/setup-test-db.ts`** – Called once at module top to wire the in-memory Mongo.
- **`tests/support/stub.ts`** – `asStub` is used to satisfy TypeScript where a `Partial` must be passed into a full-type position (incomplete entries, reading `_id`/`__v`).

## Notes

- Fixtures deliberately use only `coreAuditActions` (three security actions) so the test file compiles no matter which domain modules are enabled or removed.
- `since` is passed inside the `scope` argument, not as a top-level filter, because the generic search spec coerces range bounds with `Number()`, which would corrupt a `Date` before Mongo sees it.
- `AUDIT_SORT` includes `_id` as a secondary key; `timestamp` alone is not unique across a bulk write, and the tiebreak prevents count/page disagreement on equal timestamps.
- The deep-paging block is a regression guard: it fails against any implementation that caps the read at a fixed row count while still reporting the true `totalItems`.
- `asStub` is a test-only escape hatch; production code should not need to cast partial documents into full shapes.
