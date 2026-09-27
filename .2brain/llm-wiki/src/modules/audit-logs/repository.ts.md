---
source: src/modules/audit-logs/repository.ts
sha256: 62651789456c4f5e9f0279a521205d214221ebcc624ba54630193e785db72ae5
generated_at: 2026-09-27T14:43:03.184834+00:00
model: ollama:qwen3.8:27b
---

# src/modules/audit-logs/repository.ts

## Purpose

Append-and-read repository for audit log entries. It exposes only `create` and `search` (plus a `since` scope helper), deliberately omitting update and delete to enforce immutability at the type level. Record expiry is delegated to a Mongo TTL index defined on the model, not handled here.

## Key elements

- **`AuditLogSearchFilters`** — Interface for search parameters (`actor`, `action`, `outcome`, `since`, `target`, `page`, `pageSize`). Mirrors the query shapes declared by `GET /observability/audit` and `GET /audit`; `target` is the tenant-facing addition.
- **`base`** (internal) — The full repository instance produced by `createRepository`, configured with `applyAuditLogTransform` and four exact-match searchable fields. Not exported directly.
- **`AUDIT_SORT`** — `{ timestamp: -1, _id: -1 }`. Custom sort: newest first, `_id` as tiebreaker. Not `DEFAULT_SORT` because the model disables Mongoose timestamps and uses its own `timestamp` field.
- **`sinceScope`** — Returns `{ timestamp: { $gt: since } }` or `{}`. Bypasses `buildWhere` so the `Date` arrives at Mongo unparsed, avoiding the `Number()` coercion the shared range helper applies.
- **`auditLogRepository`** — The public export. A three-member object (`create`, `search`, `sinceScope`) that is the only surface consumers can call.

## Relationships

- **`src/modules/audit-logs/model.ts`** — Imports `auditLogModel` (the Mongoose model), `applyAuditLogTransform` (result shaping), and the `AuditLogDocument` type.
- **`src/infrastructure/persistence/create-repository.ts`** — Imports the `createRepository` factory that provides the base `create`/`search` pair and the `searchable.exact` filter mechanism.
- **`src/types/index.ts`** — Imports the `AuditEntryItem` type (the transformed read shape) used as the repository's output type parameter.
- **`src/modules/audit-logs/service.ts`** — Consumes `auditLogRepository` to serve audit queries to the application layer.
- **`src/modules/audit-logs/tests/integration/repository.test.ts`** — Integration tests exercising `create` and `search` against a live Mongo instance.
- **`src/modules/audit-logs/tests/contract/audit.test.ts`** — Contract tests verifying the repository satisfies shared audit-log interface expectations.
- **`src/modules/audit-logs/tests/unit/service.test.ts`** — Unit tests for the service that mock or depend on this repository's shape.

## Notes

- `since` is a **scope fragment**, not a declared filter in `searchable`. The shared `ranges` coercion calls `Number()` on bounds, which is correct for prices but corrupts `Date` values. Merging it as a scope after `buildWhere` preserves the `Date` instance.
- All four searchable fields are configured as **exact matches**. In particular, `outcome` must not be a partial/regex match — `'fail'` matching `'failure'` would make a filtered list silently disagree with adjacent aggregate counts.
- The `_id` tiebreaker in `AUDIT_SORT` is not optional: `timestamp` is non-unique, and without a deterministic secondary key a paged read can return a document twice or skip one when the count query and the page query interleave.
- The three-member public object is the enforcement mechanism. Because the type has no `save`, `updateOne`, or `deleteOne`, an editor cannot accidentally (or intentionally) mutate an audit record without a compile-time error.
