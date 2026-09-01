# src/modules/audit-logs/tests/integration/repository.test.ts

## Purpose

Integration tests for `auditLogRepository`, executed against the in-memory MongoDB that `setupTestDb` provisions. Covers entry creation, multi-filter search, the exclusive `since` boundary, pagination metadata, response shaping (stripping `_id`/`__v`, ISO-8601 timestamps), and a deep-paging regression guard for the former 200-row read cap.

## Key elements

- **`makeEntry(overrides?)`** – Factory returning a `Partial<AuditLogDocument>` pre-filled with core security-action fields; all fixtures in the file derive from it.
- **`search(filters?, since?)`** – Local wrapper that calls `auditLogRepository.search` with the service-level `sinceScope(since)` and `AUDIT_SORT` applied explicitly, mirroring how the service layer invokes the repository.
- **`describe('create')`** – Verifies optional context fields are persisted and that a missing required field rejects the write.
- **`describe('search')`** – Covers unfiltered ordering, actor/action/outcome filters, exclusive `since` bound, Date-vs-Number coercion, combined filters, page-size vs. total count, response shape, and empty-result pages.
- **`describe('deep paging')`** – Seeds 205 entries (1 min apart) and asserts page 21 is served, that `totalPages` is correct, and that three parallel 100-row pages partition all entries with zero overlap.

## Relationships

- **`src/modules/audit-logs/repository.ts`** – The system under test; imports `auditLogRepository` and `AUDIT_SORT`.
- **`src/infrastructure/observability/audit.ts`** – Source of `coreAuditActions` (the only action constants used as fixtures) and the `AuditEntry` type that shapes `makeEntry` output.
- **`src/modules/audit-logs/model.ts`** – Provides the `AuditLogDocument` type for casts and field-shape assertions.
- **`tests/support/setup-test-db.ts`** – Called once at module top (`setupTestDb()`) to spin up and wire the in-memory Mongo instance before any test runs.
- **`tests/support/stub.ts`** – Provides `asStub`, used to cast a returned item to `Record<string, unknown>` so internal keys (`_id`, `__v`) can be asserted as absent.

## Notes

- **Action vocabulary is deliberately core-only.** Fixtures use `coreAuditActions.*` rather than any domain's actions, so the test file compiles regardless of which feature modules are enabled.
- **`since` rides in `scope`, not in the filter spec.** The shared search-spec range helper coerces bounds with `Number()`, which would turn a `Date` into a value Mongo cannot compare against a stored `Date`. Passing it through `sinceScope` preserves the `Date` type.
- **`AUDIT_SORT` includes `_id` as a tiebreaker.** Without it, entries sharing a timestamp (e.g., a bulk write) could appear in both the count and the page in a different order, producing duplicate or missing rows across pages.
- **Deep-paging entries are spaced 60 s apart.** This guarantees a unique, deterministic "newest first" ordering and lets the test assert *which* rows a page returns via `request_id`, rather than relying on timestamp equality.
