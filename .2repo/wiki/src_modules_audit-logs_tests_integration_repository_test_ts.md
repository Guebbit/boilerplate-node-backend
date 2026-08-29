# src/modules/audit-logs/tests/integration/repository.test.ts

## Purpose

Integration tests for `auditLogRepository` covering `create` (validation, field persistence) and `search` (filtering, pagination, sorting, serialization). Exists to pin the repository's contract against a real database so that service-layer policy concerns (`since` scoping, sort order) are exercised through the actual query path rather than mocks.

## Key elements

- **`makeEntry(overrides?)`** — Factory that produces a fully-populated `AuditLogDocument` partial using `coreAuditActions.SECURITY_UNAUTHORIZED` as the default action, so every fixture is valid regardless of which feature modules are enabled.
- **`search(filters?, since?)`** — Thin wrapper that calls `auditLogRepository.search` with an explicit `sinceScope` and `AUDIT_SORT`, mirroring how the service layer invokes the base method.
- **`describe('create')`** — Verifies optional context fields round-trip and that a missing required field rejects.
- **`describe('search')`** — Covers unfiltered newest-first ordering, actor/action/outcome filters, exclusive `since` lower bound, `since`-as-Date (not coerced via `Number()`), combined filters, page vs. total accounting, `_id`/`__v` stripping, ISO-8601 timestamp serialization, and empty-result shape.
- **`describe('deep paging')`** — Seeds 205 rows and asserts that page 21 (rows 201–205) is actually served with correct `totalItems`/`totalPages`, and that three concurrent pages of 100 never duplicate an entry (relying on `AUDIT_SORT`'s `_id` tiebreaker).

## Relationships

- **`src/modules/audit-logs/repository.ts`** — The system under test; provides `auditLogRepository` (create, search, sinceScope) and the `AUDIT_SORT` constant.
- **`src/infrastructure/observability/audit.ts`** — Source of `coreAuditActions` (the three security actions used in every fixture) and the `AuditEntry` type.
- **`src/modules/audit-logs/model.ts`** — Supplies the `AuditLogDocument` type that shapes all fixtures and assertions.
- **`tests/support/setup-test-db.ts`** — Called once at module level (`setupTestDb()`) to spin up a per-suite test database.
- **`tests/support/stub.ts`** — Provides `asStub`, used to cast a returned item to `Record<string, unknown>` for the `_id`/`__v`-absence assertion.

## Notes

- Fixtures deliberately use only `coreAuditActions` (security-namespace actions) so the suite compiles in any module configuration; a domain-specific action like `admin.product.created` would break compilation if that module is removed.
- The `since` parameter is passed through `auditLogRepository.sinceScope(since)` rather than embedded in the filter object, because the search spec's range coercion (`Number()`) would corrupt a `Date` value — a regression the "keeps the `since` bound a Date" test guards against.
- The deep-paging suite exists because a prior implementation capped reads at 200 rows while still reporting the true total, making pages beyond row 200 unreachable; these tests fail against any cap-instead-of-page implementation.
