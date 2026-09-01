# src/modules/audit-logs/repository.ts

## Purpose

Append-only read/write access to the audit-log collection. Deliberately exposes no update or delete path — an editable audit trail defeats the purpose — and delegates expiry to the model's TTL index rather than in-app cleanup.

## Key elements

- **`AuditLogSearchFilters`** — Interface mirroring the `GET /observability/audit` query params (`actor`, `action`, `outcome`, `since`, `page`, `pageSize`).
- **`base`** (internal) — Result of `createRepository<AuditLogDocument>(auditLogModel, …)` with `applyAuditLogTransform` as the document mapper and an `exact` search config so `actor`, `action`, and `outcome` are matched verbatim (never as regex/partial).
- **`AUDIT_SORT`** — `{ timestamp: -1, _id: -1 }`. Custom because the model sets `timestamps: false`; the shared `DEFAULT_SORT` would target a nonexistent field. The `_id` tiebreaker stabilises pagination when timestamps collide.
- **`sinceScope`** (internal) — Builds `{ timestamp: { $gt: since } }` from a `Date`. Implemented as a scope fragment (merged after `buildWhere`) so the bound bypasses the `Number()` coercion the shared `ranges` config would otherwise apply.
- **`auditLogRepository`** (export) — Public surface: `{ create, search, sinceScope }`. Only three members; `save` and `deleteOne` are absent by design, enforced at the type level.

## Relationships

- **`src/modules/audit-logs/model.ts`** — Supplies `auditLogModel` (the Mongoose model), `applyAuditLogTransform` (document mapper), and the `AuditLogDocument` type. The model also defines the TTL index that handles expiry.
- **`src/infrastructure/persistence/create-repository.ts`** — Provides the `createRepository` factory that produces the `create`/`search` pair and the filter-building pipeline this file configures.
- **`src/modules/audit-logs/service.ts`** — Upstream consumer that calls `auditLogRepository.create` on each audited action and `auditLogRepository.search` (with `sinceScope`) to serve the observability endpoint.
- **`src/modules/audit-logs/tests/integration/repository.test.ts`** — Integration tests exercising `create` and `search` against a real Mongo instance.
- **`src/modules/audit-logs/tests/unit/service.test.ts`** — Unit tests for the service that mock/stub `auditLogRepository`.

## Notes

- **No update/delete by contract.** The exported object's type is the guard — there is no runtime check to bypass; the shape simply doesn't include those methods.
- **Exact-match search is intentional.** A partial match on `outcome` (e.g. `"fail"` hitting `"failure"`) would make filtered counts disagree with the adjacent aggregate. All three searchable fields are closed vocabularies or opaque IDs.
- **`since` is a `Date`, not a number.** It is injected via `sinceScope` specifically to avoid the `Number()` coercion in the shared range pipeline. Always pass a `Date` instance; a numeric epoch would produce a wrong comparison.
- **Sort is not `DEFAULT_SORT`.** The model carries its own `timestamp` field (not Mongoose's `createdAt`/`updatedAt`). Do not "fix" the sort to use the shared constant.
