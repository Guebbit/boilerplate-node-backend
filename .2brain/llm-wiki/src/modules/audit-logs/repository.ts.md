---
source: src/modules/audit-logs/repository.ts
source_sha256: a5646b99f43b4156915ab893581a1f591b33bc118a4f40676153658dfdea979a
context_sha256: 48449f6d78ec9dec66d0aa41c2f48037639a51587f2f592e265af6c8feddc01f
generated_at: 2026-11-22T04:27:43.518345+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/audit-logs/repository.ts

## Purpose
Audit log repository. It deliberately exposes only two kinds of operation: append an entry and read entries. There is no update or delete, because an audit trail editable by the application isn't a trustworthy one. Expiry is left to Mongo's TTL index defined on the model.

## Key elements
- **`AuditLogSearchFilters`**: the filter shape accepted by `search`. Fields are `actor`, `action`, `outcome` (`'success' | 'failure'`), `since` (exclusive lower bound), `target`, `subject`, `ownOrder`, `page` and `pageSize`. It mirrors the query parameters of `GET /observability/audit` and `GET /audit`.
- **`base`** (internal): `createRepository(auditLogModel, …)` configured with `applyAuditLogTransform` and exact-match searchable fields. The mapping is `actor`→`actorUserId`, `action`→`action`, `outcome`→`outcome`, `target`→`targetId`, `subject`→`subjectId`. These are matched verbatim and never as a regex, so `'fail'` does not match `'failure'`.
- **`AUDIT_SORT`**: `{ timestamp: -1, _id: -1 }`, newest first with `_id` as the tiebreaker. It is used instead of the shared `DEFAULT_SORT` because the model has `timestamps: false` and its own `timestamp` field.
- **`sinceScope(since?)`**: returns `{ timestamp: { $gt: since } }`, or `{}` if there is no `since`. It is a scope fragment rather than a declared filter because the spec's `ranges` coerce bounds with `Number()`, which is wrong for dates.
- **`ownOrderScope(ownOrder?)`**: `true` returns `{ 'metadata.ownOrder': true }`. `false` returns `{ $ne: true }`, which includes entries where the flag is absent. `undefined` returns `{}`.
- **`OwnEntriesCursor`**: `{ timestamp, seen: ObjectId[] }`. `seen` holds the ids already returned at that timestamp.
- **`ownEntriesPage(actor, after, limit)`**: keyset-paginated read of one actor's own entries, newest first, for the account data export. It does no count and no skip. It returns `{ items, next }`, and `next` is `undefined` when the page is shorter than `limit`.
- **`cursorAfter`** (internal): builds the next cursor from the oldest timestamp reached. It carries over the previous `seen` ids when the page did not move past that timestamp.
- **`ConsultationRow`** and **`consultationsOf(subject, actions, since)`**: rows naming `subject` whose action is in `actions`, with `timestamp >= since`, newest first. The projection is `timestamp`, `action`, `targetType` and `targetId`. The actor is never selected, so it cannot reach an export.
- **`auditLogRepository`**: the export. It has only `create`, `search`, `sinceScope`, `ownOrderScope`, `ownEntriesPage` and `consultationsOf`. There is no `save` or `deleteOne`, so the type itself refuses edits.

## Relationships
- **`src/infrastructure/persistence/create-repository.ts`**: supplies `createRepository`, which provides `create`, `search` and `normalize`.
- **`src/modules/audit-logs/model.ts`**: supplies `auditLogModel`, `applyAuditLogTransform` and the `AuditLogDocument` type. It also owns the TTL index and the `{ actorUserId, timestamp }` and `{ subjectId, timestamp }` indexes that the reads rely on.
- **`src/types/index.ts`**: supplies `AuditEntryItem`, the output item type.
- **`src/modules/audit-logs/service.ts`** and the test files listed as neighbors are the consumers and verifiers of this repository. The file content does not show how they call it.

## Notes
- `ownEntriesPage` and `consultationsOf` query the model directly, bypassing the shared `search`. `ownEntriesPage` sorts on `timestamp` only. Its keyset cursor depends on the `$lte` timestamp plus `_id: { $nin: seen }` filter rather than on an `_id` tiebreak.
- In `ownEntriesPage`, the cursor is computed before `base.normalize(rows)` because normalization rewrites rows in place. It turns `timestamp` into a string and removes `_id`, and the cursor needs both as stored.
- `since` is an exclusive bound in `sinceScope` (`$gt`) but inclusive in `consultationsOf` (`$gte`).
- `sinceScope` and `ownOrderScope` are merged as `scope` after `buildWhere`, so they bypass the declared filter handling. `sinceScope`'s `Date` therefore reaches Mongo as the `Date` the controller parsed.
- The module docs referenced by the file header (`@see` the pipeline section of the audit-logs module documentation) hold further background; that document is not among the listed neighbors.
