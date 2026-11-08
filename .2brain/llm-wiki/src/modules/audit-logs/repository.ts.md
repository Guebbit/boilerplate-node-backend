---
source: src/modules/audit-logs/repository.ts
sha256: b7a7968f64b2745dfa8f0b39ae0b75fb8224c83dedd6c9d939034c0cce8b414c
generated_at: 2026-11-08T05:08:59.578523+00:00
model: ollama:qwen3.8:27b
---

# src/modules/audit-logs/repository.ts

## Purpose

Append-only data-access layer for the audit log collection. It exposes exactly two operations — write one entry, read a filtered page — and deliberately omits any update or delete path so the type system itself enforces immutability. Expiry is delegated to a MongoDB TTL index defined on the model, not to application logic.

## Key elements

- **`AuditLogSearchFilters`** (exported interface) — the query-parameter contract for `GET /observability/audit` and `GET /audit`. Fields include `actor`, `action`, `outcome`, `since`, `target`, `ownOrder`, `page`, `pageSize`.
- **`AUDIT_SORT`** (exported const) — `{ timestamp: -1, _id: -1 }`. Overrides the shared `DEFAULT_SORT` because the model sets `timestamps: false` and carries its own `timestamp` field. The `_id` tiebreaker prevents duplicate/missing rows when `timestamp` values collide across a count-then-page read.
- **`sinceScope(since?)`** (internal) — returns `{ timestamp: { $gt: since } }` or `{}`. Used as a *scope fragment* merged after `buildWhere` so the `Date` arrives at Mongo un-mangled (the shared `ranges` coercion calls `Number()`, which would corrupt a date).
- **`ownOrderScope(ownOrder?)`** (internal) — maps the tri-state `ownOrder` filter: `true` → `{ 'metadata.ownOrder': true }`, `false` → `{ 'metadata.ownOrder': { $ne: true } }`, `undefined` → `{}`.
- **`OwnEntriesCursor`** (exported interface) — `{ timestamp: Date; seen: Types.ObjectId[] }`. Keyset-cursor for sequential reads of a single actor's entries.
- **`cursorAfter(rows, after)`** (internal) — computes the next cursor from the last row's timestamp plus all IDs already returned at that timestamp (carrying over from the prior cursor if the page didn't move past it).
- **`ownEntriesPage(actor, after, limit)`** (internal) — keyset-cursor pagination for the account data-export endpoint. Walks the `{ actorUserId, timestamp }` index with `$lte`/`$nin` instead of `countDocuments` + `skip`, making each page O(page) rather than O(total).
- **`auditLogRepository`** (exported const) — the public surface: `{ create, search, sinceScope, ownOrderScope, ownEntriesPage }`. Four members; `save` and `deleteOne` from the base repository are intentionally excluded.

## Relationships

- **`src/modules/audit-logs/model.ts`** — provides `auditLogModel` (the Mongoose model bound to this repository) and `applyAuditLogTransform` (the document→DTO mapper passed to `createRepository`).
- **`src/infrastructure/persistence/create-repository.ts`** — the shared factory that produces the `base` object (`create`, `search`, `normalize`) with the `exact`-match and transform configuration declared here.
- **`src/types/index.ts`** — source of the `AuditEntryItem` type used as the output DTO throughout.
- **`src/modules/audit-logs/service.ts`** — the module service that calls into `auditLogRepository` for its domain operations (append on audit-worthy events, filtered reads for observability and export endpoints).
- **Tests** — `repository.test.ts` exercises `ownEntriesPage` and the search path end-to-end; `audit.contract.test.ts` verifies the exported surface matches the contract; `incidents.test.ts` and `service.test.ts` exercise the repository indirectly through the service layer.

## Notes

- **No update/delete by design.** The exported object simply doesn't expose those methods; a caller can't accidentally mutate an audit row without a deliberate code change.
- **`since` is a scope, not a filter.** It bypasses the shared `buildWhere`/`ranges` pipeline because that pipeline coerces bounds via `Number()`. If you move it into the declared filter config, dates will silently break.
- **`ownOrder: false` means "not flagged," not "flag is false."** The flag is only ever written as `true`; absent is equivalent to unflagged, so the query is `$ne: true`, not `= false`.
- **`ownEntriesPage` reads raw then normalizes.** The cursor is computed *before* `base.normalize` because normalization rewrites `timestamp` to a string and drops `_id` in place. Reversing that order would corrupt the cursor.
- **`AUDIT_SORT` is not interchangeable with the shared `DEFAULT_SORT`.** The model has no `createdAt`/`updatedAt` (`timestamps: false`), so the shared constant would sort on a non-existent field.
