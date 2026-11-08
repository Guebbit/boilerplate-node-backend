---
source: src/modules/audit-logs/tests/integration/repository.test.ts
sha256: a73e2ae46fbd45b862e9673a10df0c26a5c419ea23a458a07b5fe6e3c63df8b9
generated_at: 2026-11-08T05:10:04.359882+00:00
model: ollama:qwen3.8:27b
---

# src/modules/audit-logs/tests/integration/repository.test.ts

## Purpose

Integration test suite for `auditLogRepository` (and a slice of `auditLogService`) running against an in-memory MongoDB wired up by `setupTestDb`. It validates create/search semantics, filter combinations, the exclusive `since` bound, pagination metadata, deep-paging correctness beyond 200 rows, and the `ownOrder` metadata filter.

## Key elements

- **`makeEntry(overrides?)`** – Factory returning a fully-shaped `Partial<AuditLogDocument>` using `coreAuditActions.SECURITY_UNAUTHORIZED` as the default action. All fixtures flow through this helper.
- **`search(filters?, since?)`** – Local wrapper around `auditLogRepository.search` that injects `auditLogRepository.sinceScope(since)` and `AUDIT_SORT`, mirroring what the service would apply.
- **`describe('auditLogRepository > create')`** – Verifies optional context fields round-trip, `actorCredentialId` persists, and missing required fields reject.
- **`describe('auditLogRepository > search')`** – Covers default newest-first ordering, filtering by `actor`/`action`/`outcome`/`target`, exclusive `since` lower bound, Date-vs-Number coercion safety, combined filters, page-size vs. total-count distinction, `_id`/`__v` stripping, ISO-8601 `timestamp` formatting, and empty-result shape.
- **`describe('auditLogRepository > deep paging')`** – Seeds 205 rows with minute-apart timestamps; asserts page 21 returns the five oldest rows and that three parallel 100-row pages yield 205 unique rows (guards against a 200-row capped read).
- **`walk(actor, limit)`** – Helper that repeatedly calls `auditLogRepository.ownEntriesPage` until `next` is undefined, collecting `requestId`s and page count.
- **`targetsOf(items)`** – Extracts and sorts `targetId` values from a page for deterministic assertions.
- **`describe('auditLogService.search — the ownOrder filter')`** – Seeds entries with `metadata.ownOrder: true`, a different metadata key, and no metadata; asserts the service-level `ownOrder: true` filter returns only the flagged entry.

## Relationships

- **`src/modules/audit-logs/repository.ts`** – Primary unit under test: `auditLogRepository.create`, `.search`, `.sinceScope`, `.ownEntriesPage`, and the `AUDIT_SORT` constant.
- **`src/modules/audit-logs/service.ts`** – Exercised for the `ownOrder` filter path via `auditLogService.search`; `OWN_ENTRIES_PAGE` imported (used as the default page size in the service).
- **`src/modules/audit-logs/model.ts`** – Type-only import of `AuditLogDocument` for fixture and assertion typing.
- **`src/infrastructure/observability/audit.ts`** – Provides `coreAuditActions` (the three security actions used as fixture values) and the `AuditEntry` type.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` is called at module scope to spin up the in-memory Mongo the repository connects to.
- **`tests/support/stub.ts`** – `asStub` is used to cast a search result item to `Record<string, unknown>` so the test can assert `_id` and `__v` are absent.

## Notes

- **Deliberate use of `coreAuditActions` only.** The comment block explains that domain-specific action strings (e.g. `admin.product.created`) would break compilation if that module is removed. Core's three security actions are the only guaranteed-stable vocabulary for a module that merely stores audit data.
- **`since` must stay a `Date`.** The repository's search spec coerces range bounds with `Number()`, which would turn a `Date` into a millisecond integer Mongo cannot compare against a stored `Date`. Passing it through `sinceScope` avoids that coercion; a dedicated test pins this behavior.
- **`AUDIT_SORT` includes `_id`.** Timestamps are not unique under bulk writes; the secondary `_id` sort ensures the count and the page agree on tie order (asserted in the "never returns the same entry on two pages" test).
- **Deep-paging block is regression-specific.** The `beforeEach` inserts 205 rows so that any read capped at 200 (while still reporting `totalItems: 205`) will fail the page-21 assertion.
- **`timestamp` is asserted as an ISO-8601 string**, not a `Date` object, matching the `format: date-time` contract in `openapi.yaml` that the admin table consumes directly.
