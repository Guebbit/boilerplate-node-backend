---
source: src/modules/audit-logs/repository.ts
sha256: b7a7968f64b2745dfa8f0b39ae0b75fb8224c83dedd6c9d939034c0cce8b414c
generated_at: 2026-10-29T03:17:59.505182+00:00
model: ollama:qwen3.8:27b
---

# src/modules/audit-logs/repository.ts

## Purpose

Data-access layer for the audit log. Strictly append-and-read: one write entry point (`create`) and two read paths (filtered page search, keyset-cursor pagination for an actor's own entries). There is no update or delete by design — expiry is delegated to a Mongo TTL index on the model.

## Key elements

- **`auditLogRepository`** (exported) — the sole public surface; exposes `create`, `search`, `sinceScope`, `ownOrderScope`, `ownEntriesPage`. Deliberately omits `save`/`deleteOne` so the type itself refuses edits.
- **`AuditLogSearchFilters`** — interface mirroring the query params of `GET /observability/audit` and `GET /audit` (actor, action, outcome, since, target, ownOrder, page, pageSize).
- **`AUDIT_SORT`** — `{ timestamp: -1, _id: -1 }`. Custom (not the shared `DEFAULT_SORT`) because the model sets `timestamps: false` and carries its own `timestamp` field; the `_id` tiebreaker prevents duplicate/missing rows across a paged read.
- **`sinceScope` / `ownOrderScope`** — scope fragments (not declared filters) that are merged *after* `buildWhere`, so the `Date` and boolean values reach Mongo uncoerced.
- **`OwnEntriesCursor` / `OwnEntriesPage`** — keyset-cursor types: `{ timestamp, seen: ObjectId[] }` and the page shape with an optional `next` cursor.
- **`cursorAfter`** — computes the next cursor from a page of rows, carrying over already-seen ids at the same timestamp.
- **`ownEntriesPage`** — reads one page of a single actor's entries via keyset cursor against the `{ actorUserId, timestamp }` index; no `countDocuments` or `skip`.

## Relationships

- **`src/modules/audit-logs/model.ts`** — imports `auditLogModel` (the Mongoose model) and `applyAuditLogTransform` (doc → `AuditEntryItem` mapping). The model defines the schema, the TTL index, and `timestamps: false`.
- **`src/infrastructure/persistence/create-repository.ts`** — provides the shared `createRepository` factory that yields the `create`/`search`/`normalize` pair scoped to the audit collection.
- **`src/types/index.ts`** — source of the `AuditEntryItem` type used as the output shape.
- **`src/modules/audit-logs/service.ts`** — upstream consumer; calls into `auditLogRepository` to fulfil audit-log use-cases.
- **Tests** (`repository.test.ts`, `audit.test.ts`, `incidents.test.ts`, `service.test.ts`) — exercise this file's public surface at the unit, integration, and contract levels.

## Notes

- `since` and `ownOrder` are scope fragments, **not** declared filters. The shared `ranges` coerce bounds with `Number()`, which is correct for prices but wrong for dates; scopes bypass `buildWhere` entirely.
- All four searchable fields are configured as **exact** matches. In particular, `outcome: 'fail'` will not match `'failure'` — a partial match would make a filtered view silently disagree with adjacent counts.
- `ownOrder: false` translates to `{ 'metadata.ownOrder': { $ne: true } }` because the flag is only ever written as `true`; "not flagged" includes documents where the field is absent.
- `ownEntriesPage` avoids the shared `search`'s count-then-skip pattern, which would cost O(n²) for a long actor trail. Each page is a single indexed range scan.
- In `ownEntriesPage`, the cursor is computed **before** `base.normalize(rows)` because normalize rewrites rows in place (`timestamp` → string, `_id` removed) and the cursor needs the raw stored values.
