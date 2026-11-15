---
source: src/modules/audit-logs/repository.ts
sha256: a12b589cc19d62e533751105ec6c5896066ef57770630a376b2276106428d73c
generated_at: 2026-11-14T19:25:07.567851+00:00
model: ollama:qwen3.8:27b
---

# src/modules/audit-logs/repository.ts

## Purpose

Repository layer for the audit-log collection. It exposes an append-and-read-only surface (one `create`, filtered `search`, plus two purpose-built reads) and deliberately omits any update or delete path, since an editable trail is not an audit trail. Expiry is handled by a TTL index on the model, not by application code.

## Key elements

- **`AuditLogSearchFilters`** – interface describing the filterable fields accepted by `search`; mirrors the query params of the audit routes.
- **`base`** (private) – instance of the shared `createRepository` factory bound to `auditLogModel`; provides `create`, `search`, and `normalize`. All searchable fields are declared `exact` (verbatim match, never regex).
- **`AUDIT_SORT`** – `{ timestamp: -1, _id: -1 }`. Custom because the model sets `timestamps: false`; the `_id` tiebreaker prevents duplicates or gaps in paged reads where `timestamp` is not unique.
- **`sinceScope`** – returns `{ timestamp: { $gt: date } }` or `{}`. Implemented as a scope fragment (merged after `buildWhere`) so the `Date` is not coerced through `Number()`.
- **`ownOrderScope`** – maps `true` → `{ 'metadata.ownOrder': true }`, `false` → `{ $ne: true }`, `undefined` → `{}`.
- **`OwnEntriesCursor`** / **`OwnEntriesPage`** – keyset-cursor types for the actor's own-entries export.
- **`cursorAfter`** (private) – computes the next cursor from a page of rows, carrying over `seen` ids when the page edge didn't advance past the previous timestamp.
- **`ownEntriesPage`** – one page of an actor's entries via keyset pagination on `{ actorUserId, timestamp }` index; no `countDocuments`, no `skip`, so each page costs O(page) rather than O(position).
- **`ConsultationRow`** / **`consultationsOf`** – reads consultation entries for a `subjectId` with a projection that excludes `_id` and the actor, so the staff identity never reaches a data export.
- **`auditLogRepository`** (default export) – the public object: `{ create, search, sinceScope, ownOrderScope, ownEntriesPage, consultationsOf }`.

## Relationships

- **`src/infrastructure/persistence/create-repository.ts`** – provides the `createRepository` generic factory that builds `base` (create + search + normalize).
- **`src/modules/audit-logs/model.ts`** – source of `auditLogModel`, `applyAuditLogTransform` (used as the `transform` option), and the `AuditLogDocument` type.
- **`src/types/index.ts`** – source of the `AuditEntryItem` shape returned by `normalize`.
- **`src/modules/audit-logs/service.ts`** – primary consumer; calls `auditLogRepository` to fulfil read and write operations.
- **Tests** (`repository.test.ts`, `audit.contract.test.ts`, `incidents.test.ts`, `service.test.ts`, `staff-reads.test.ts`) – exercise the repository's filter, pagination, and projection behaviour at unit, integration, and contract levels.

## Notes

- **Append-only by type, not by review.** The exported object has no `save` or `deleteOne`; the type system is the guard, not a lint rule.
- **`since` is a scope, not a declared filter.** Declared filters pass through `buildWhere`, which coerces range bounds with `Number()`—correct for prices, wrong for dates. The scope fragment bypasses that path.
- **`ownOrder: false` means "anything other than `true`".** The flag is only ever written as `true`, so the negation is `{ $ne: true }` (includes documents where the field is absent).
- **Keyset cursor for own-entries.** The shared `search` does `countDocuments` + `skip` on every page, which is quadratic over a long trail. `ownEntriesPage` walks the compound index instead.
- **Cursor computed before `normalize`.** `normalize` mutates rows in place (stringifies `timestamp`, strips `_id`); `cursorAfter` needs the raw stored values, so it must run first.
- **`consultationsOf` projection omits the actor.** The staff member's identity is never selected, preventing it from leaking into a subject's data export.
