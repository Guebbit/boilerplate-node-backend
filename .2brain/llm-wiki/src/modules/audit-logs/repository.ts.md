---
source: src/modules/audit-logs/repository.ts
sha256: 36ea2d89af24fe261b61d89fbf741c2998217e0f528a500aff36355d1b697375
generated_at: 2026-09-23T18:27:22.573904+00:00
model: ollama:qwen3.8:27b
---

# src/modules/audit-logs/repository.ts

## Purpose

Append-and-read data access for audit log entries. Exposes only `create` and `search` — deliberately no update or delete path — and delegates collection access to the shared repository factory. Expiry is handled by the TTL index on the model, not by application code.

## Key elements

- **`AuditLogSearchFilters`** – Interface mirroring the query params of `GET /observability/audit` and `GET /audit`. Includes `actor`, `action`, `outcome`, `target`, `since`, `page`, `pageSize`.
- **`base`** (internal) – The result of `createRepository(auditLogModel, …)`. Configures four exact-match searchable fields (`actor_user_id`, `action`, `outcome`, `target_id`) and the `applyAuditLogTransform` output mapper.
- **`AUDIT_SORT`** – Exported sort spec: `{ timestamp: -1, _id: -1 }`. Used in place of the shared `DEFAULT_SORT` because this model sets `timestamps: false` and carries its own `timestamp` field. The `_id` tiebreaker prevents duplicate/skipped rows on paged reads.
- **`sinceScope(since?)`** – Returns `{ timestamp: { $gt: since } }` or `{}`. Kept as a separate "scope" fragment (merged after `buildWhere`) so the `Date` value is never passed through `Number()` coercion that the spec's range filters apply.
- **`auditLogRepository`** – The single exported object. Exposes `create`, `search`, and `sinceScope` only. The reduced surface is intentional: the type itself prevents callers from invoking `save` or `deleteOne`.

## Relationships

- **`@infrastructure/persistence/create-repository`** – Provides the `createRepository` factory that builds the `base` object (create/search pair) used by this module.
- **`./model`** – Source of `auditLogModel` (Mongoose model), `applyAuditLogTransform` (output mapper), and the `AuditLogDocument` type parameter.
- **`./service`** – Consumer; the service layer calls `auditLogRepository.create` / `.search` and passes `sinceScope` as the date-bound filter.
- **Tests** (`repository.test.ts`, `service.test.ts`, `audit.test.ts`) – Cover the append-only contract, exact-match filter semantics, `AUDIT_SORT` ordering, and `sinceScope` date handling.

## Notes

- All four searchable fields are **exact-match only** (no regex/partial). In particular, `outcome` must not partially match: `'fail'` matching `'failure'` would silently desynchronise filtered counts.
- `since` is an **exclusive** lower bound (`$gt`), consistent with the buffer's `> since` behaviour. It bypasses the normal filter pipeline to preserve the `Date` object.
- `AUDIT_SORT` is not interchangeable with the shared `DEFAULT_SORT` constant; using the shared one would sort on a non-existent `createdAt`/`updatedAt` field.
