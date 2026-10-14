---
source: src/modules/audit-logs/tests/integration/repository.test.ts
sha256: 4078bb3347c6b1c57561cf14ac3af066ad0e0b1c2ed069f48db5a63b8f929ee3
generated_at: 2026-10-14T15:06:50.072628+00:00
model: ollama:qwen3.8:27b
---

# src/modules/audit-logs/tests/integration/repository.test.ts

## Purpose
Integration test suite that exercises `auditLogRepository` (create, search, deep paging, and cursor-based own-trail reads) against an in-memory MongoDB spun up by `setupTestDb`. It exists to lock in the repository's contract—filter semantics, pagination math, `since`-bound exclusivity, tie-breaking sort order, and field-shape guarantees—so that regressions in the capped-read or cursor logic are caught before they reach the service layer.

## Key elements
- **`makeEntry(overrides)`** — builds a fully-populated `AuditLogDocument` fixture using `coreAuditActions` and sensible defaults; every test entry derives from this.
- **`search(filters, since?)`** — thin wrapper that calls `auditLogRepository.search` with the explicit `sinceScope` and `AUDIT_SORT` the service would pass, keeping test call-sites short.
- **`describe('auditLogRepository') > 'create'`** — verifies storage of optional context fields, credential-id round-trip, and rejection of incomplete entries.
- **`describe('auditLogRepository') > 'search'`** — covers unfiltered ordering, single/combo filters (`actor`, `action`, `outcome`, `target`), exclusive `since` lower bound, Date-vs-Number coercion safety, page-size vs. total-items distinction, `_id`/`__v` stripping, ISO-8601 timestamp shape, and the empty-result case.
- **`describe('deep paging')`** — seeds 205 entries a minute apart; asserts page 21 (rows 201–205) is served and that three overlapping 100-row pages contain no duplicates (validates `AUDIT_SORT`'s `_id` tie-breaker).
- **`walk(actor, limit)`** — helper that follows `ownEntriesPage` cursors until exhausted, mimicking the export path in `findOwnAuditEntries`.
- **`describe('reading an actor's own trail by cursor')`** — seeds 7 tied-timestamp entries for one actor and asserts the cursor walk returns each exactly once even when a page boundary splits the tie.

## Relationships
- **`src/modules/audit-logs/repository.ts`** — the system under test; the suite calls `auditLogRepository.create`, `.search`, `.sinceScope`, `.ownEntriesPage`, and the exported `AUDIT_SORT`.
- **`src/infrastructure/observability/audit.ts`** — source of `coreAuditActions` (the three security actions) and the `AuditEntry` type used to shape fixtures; deliberately avoids domain-specific actions.
- **`src/modules/audit-logs/model.ts`** — provides the `AuditLogDocument` type that `makeEntry` returns and that assertions are cast against.
- **`src/modules/audit-logs/service.ts`** — `findOwnAuditEntries` and `OWN_ENTRIES_PAGE` are imported; the cursor-walk `describe` block mirrors how the service pagers consume `ownEntriesPage`.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called at module scope to provision the in-memory Mongo collection the repository reads/writes.
- **`tests/support/stub.ts`** — `asStub<Record<string, unknown>>` is used to inspect raw document keys (`_id`, `__v`) without leaking internal typing into assertions.

## Notes
- **Action vocabulary is intentionally core-only.** The file's comments explain that domain actions (e.g. `admin.product.created`) are compiled per enabled module and would break the test if that module is removed; the three `coreAuditActions` are the stable set.
- **`since` is exclusive (`>`), not inclusive.** This matches the ring-buffer paging contract: passing the newest timestamp you already hold must not re-return that row.
- **`since` is passed as a `Date` inside `scope`, not in the filter object's range spec.** The range spec coerces bounds with `Number()`, which would corrupt a Date comparison in Mongo; the test explicitly guards against that regression.
- **`AUDIT_SORT` includes `_id` as a secondary sort key.** Without it, bulk-written entries sharing a timestamp have no deterministic page boundary and the "no duplicate rows across pages" assertion would be flaky.
- **The file is truncated in the provided snapshot**; the final cursor-walk assertions (beyond the 7-tied-entries case) are not visible here.
