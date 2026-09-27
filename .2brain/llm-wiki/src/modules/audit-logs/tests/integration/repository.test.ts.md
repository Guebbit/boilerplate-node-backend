---
source: src/modules/audit-logs/tests/integration/repository.test.ts
sha256: a4459ebed7abf2f961d360ce01d9204907d3ef2695156a9bac98e7dc4e557d6a
generated_at: 2026-09-27T14:43:32.476648+00:00
model: ollama:qwen3.8:27b
---

# src/modules/audit-logs/tests/integration/repository.test.ts

## Purpose

Integration tests for `auditLogRepository` run against an in-memory MongoDB instance. They verify `create`, `search` (filtering, `since` semantics, pagination metadata, serialization), and a deep-paging scenario that fails against any implementation that caps reads instead of truly paginating.

## Key elements

- **`makeEntry(overrides)`** – Factory returning a `Partial<AuditLogDocument>` shaped like a real `emitAuditEvent` sink payload. All fixtures use `coreAuditActions` so the spec compiles regardless of which optional modules are enabled.
- **`search(filters?, since?)`** – Local wrapper that calls `auditLogRepository.search` with `sinceScope(since)` and `AUDIT_SORT` explicitly, mirroring how the service layer invokes the base `search`.
- **`describe('create')`** – Two cases: round-trips every optional context field; rejects an entry missing required fields.
- **`describe('search')`** – Ten cases covering: newest-first default order; filtering by `actor`, `action`, `outcome`, `target`; `since` as an exclusive `>` bound; `since` remaining a `Date` (not `Number()`-coerced); combined filters; page-size vs. `totalItems` distinction; stripping of `_id`/`__v`; ISO-8601 `timestamp` serialization; empty-result shape.
- **`describe('deep paging')`** – Seeds 205 rows with distinct timestamps (one minute apart) and verifies that page 21 of 10 returns rows 201–205, and that three concurrent 100-row pages partition the set without duplicates.

## Relationships

- **`src/modules/audit-logs/repository.ts`** – The system under test: imports `auditLogRepository` and `AUDIT_SORT`.
- **`src/infrastructure/observability/audit.ts`** – Source of `coreAuditActions` (fixture vocabulary) and the `AuditEntry` type that shapes `makeEntry` output.
- **`src/modules/audit-logs/model.ts`** – Provides the `AuditLogDocument` type used in fixture and assertion signatures.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` boots the in-memory Mongo that every test runs against.
- **`tests/support/stub.ts`** – `asStub` is used to cast a typed result to `Record<string, unknown>` so the serialization test can assert the *absence* of `_id`/`__v` at runtime.

## Notes

- **Exclusive `since`.** The bound is `>`, not `>=`. This matches the ring-buffer paging contract so that "the newest timestamp I already have" never re-returns that entry. The test explicitly asserts the boundary row is excluded.
- **`since` must stay a `Date`.** The shared search-spec range helper coerces bounds with `Number()`, which would turn a `Date` into an epoch millis value Mongo cannot compare against the stored `Date`. Passing `since` through `sinceScope` avoids that coercion; the dedicated test would fail if the coercion crept in.
- **`AUDIT_SORT` tie-break.** Sort is `[timestamp desc, _id desc]`. Without the `_id` tie-break, bulk writes with identical timestamps could cause the count and the page to disagree, producing duplicates across pages. The "no duplicate rows" deep-paging test guards this.
- **Deep-paging regression.** The 205-row fixture is intentionally above a previous 200-row read cap. Any implementation that counts all matching docs but returns only the first 200 will pass the `totalItems` assertion yet fail the "serves row 201" assertion.
- **`spec-arbitraries.ts`** is listed in the dependency graph but is not imported by this file; no interaction exists.
