# src/modules/audit-logs/repository.ts

## Purpose

Append-only data access layer for audit-log entries. It exposes exactly two operations—create one entry and read a filtered, paginated page—and deliberately omits any update or delete path so that the repository type itself (not a reviewer) enforces immutability. Expiry is handled by a MongoDB TTL index on the model, not by application code.

## Key elements

- **`AuditLogSearchFilters`** – Interface mirroring the query params declared by `GET /observability/audit` (`actor`, `action`, `outcome`, `since`, `page`, `pageSize`).
- **`base`** (internal) – Instance created via `createBaseRepository<AuditLogDocument>` with `applyAuditLogTransform` and an `exact` search config for `actor_user_id`, `action`, and `outcome` (verbatim match, never regex).
- **`AUDIT_SORT`** – `{ timestamp: -1, _id: -1 }`. Sorts newest-first with `_id` as tiebreaker. Explicitly **not** the shared `DEFAULT_SORT` because the model sets `timestamps: false` and carries its own `timestamp` field.
- **`sinceScope(since?)`** – Returns `{ timestamp: { $gt: since } }` or `{}`. Passed as a *scope* fragment (merged post-`buildWhere`) rather than a declared filter, so the `Date` arrives at Mongo unmodified instead of being coerced by `Number()`.
- **`auditLogRepository`** – The public export. A plain object exposing only `create`, `search`, and `sinceScope`. The restricted shape (three members vs. the base repository's full surface) is the enforcement mechanism for append-only semantics.

## Relationships

- **`./model`** – Imports `auditLogModel` (the Mongoose model, used as the collection target) and `applyAuditLogTransform` (row-to-DTO mapping applied on read).
- **`@infrastructure/persistence/base-repository`** – Imports `createBaseRepository`, the generic factory that provides `create`, `search`, and the scope/filter/searchable mechanism this file configures.
- **`./service`** – Consumes `auditLogRepository` and `AUDIT_SORT` to fulfil use-cases (log an action, query filtered pages).
- **`./tests/integration/repository.test.ts`** – Exercises `create` and `search` against a real Mongo instance, verifying sort order, exact-match filtering, and `sinceScope` behaviour.
- **`./tests/unit/service.test.ts`** – Mocks the repository's three-member surface; the narrow type makes it straightforward to assert no accidental `deleteOne`/`save` calls leak into service logic.

## Notes

- **Exact match on `outcome`:** The comment warns that a partial/regex match (e.g. `'fail'` hitting `'failure'`) would cause a filtered view to disagree with its adjacent count. The `exact` config in `searchable` is the guard.
- **Sort ≠ `DEFAULT_SORT`:** Because `timestamps: false` on this model, the shared constant (which sorts on `createdAt`) would target a nonexistent field. The explicit `AUDIT_SORT` exists solely because of that divergence.
- **`since` via scope, not filter:** The base repository's range coercion uses `Number()`, which is correct for numeric bounds (price) but corrupts a `Date`. Routing `since` through `sinceScope` bypasses `buildWhere` entirely and hands the `Date` object straight to the Mongo query.
- **Type-level immutability:** `auditLogRepository` is a hand-assembled object literal, not a class or spread of `base`. Adding a fourth key requires an explicit edit and a type error at the call-site, which is the intended friction.
