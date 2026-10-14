---
source: src/modules/audit-logs/repository.ts
sha256: 5009a639495d8266064f2463cc8f31e6a8cf7bd0b54afec438c619a5bb6fee26
generated_at: 2026-10-14T15:05:17.435158+00:00
model: ollama:qwen3.8:27b
---

# src/modules/audit-logs/repository.ts

## Purpose

Read-only data access layer for the audit log collection. It exposes two operations — append one entry, read a filtered page — and deliberately omits any update or delete path. Expiry is handled by the model's TTL index, not by application code.

## Key elements

- **`AuditLogSearchFilters`** — input shape for `search`; mirrors the query params on `GET /observability/audit` and `GET /audit`. `target` is the tenant-facing addition.
- **`base`** (internal) — the shared `createRepository` factory result, configured with `applyAuditLogTransform` and four exact-match fields (`actorUserId`, `action`, `outcome`, `targetId`). Exact matching is intentional to prevent partial-string false positives (e.g. `'fail'` matching `'failure'`).
- **`AUDIT_SORT`** — `{ timestamp: -1, _id: -1 }`. Not the shared `DEFAULT_SORT` because this model uses `timestamps: false`; the `_id` tiebreaker stabilises paging when multiple rows share a timestamp.
- **`sinceScope`** — returns a `{ timestamp: { $gt: since } }` fragment (or `{}`). Kept out of the declared-filter path so the `Date` value is not coerced by the factory's `Number()` range handling.
- **`OwnEntriesCursor` / `OwnEntriesPage`** — keyset-cursor types for paginating one actor's own entries (used by data export). `seen` carries `_id`s already returned at the boundary timestamp.
- **`cursorAfter`** (internal) — computes the next cursor from a page of rows; merges `seen` ids carried from the prior cursor when the page did not advance past the same timestamp.
- **`ownEntriesPage`** (internal) — one keyset page scoped to a single `actorUserId`. Uses `find` + `$lte`/`$nin` on the composite index instead of `countDocuments` + `skip`, keeping per-page cost constant.
- **`auditLogRepository`** (exported) — the public surface: `{ create, search, sinceScope, ownEntriesPage }`. Intentionally narrower than the full base repository (no `save`, `deleteOne`, etc.) so the type system enforces append-and-read.

## Relationships

- **`src/infrastructure/persistence/create-repository.ts`** — supplies the `createRepository` factory that produces `base` (create + search pair with normalisation).
- **`src/modules/audit-logs/model.ts`** — source of `auditLogModel` (Mongoose model + TTL index), `applyAuditLogTransform`, and the `AuditLogDocument` type.
- **`src/modules/audit-logs/service.ts`** — primary consumer of `auditLogRepository`; orchestrates filter parsing and calls `create` / `search` / `ownEntriesPage`.
- **`src/types/index.ts`** — provides the shared `AuditEntryItem` DTO type used throughout.
- **`tests/integration/repository.test.ts`** — integration tests exercising the repository against a real Mongo instance.
- **`tests/contract/audit.test.ts`** — contract tests validating the search/sort/filter behaviour.
- **`tests/integration/incidents.test.ts`** — integration tests for incident-related audit queries that depend on this repository.
- **`tests/unit/service.test.ts`** — unit tests that mock the repository surface exported here.

## Notes

- The `outcome` filter is exact-match only. A partial match would make a filtered list silently disagree with adjacent aggregate counts.
- `since` is passed as a *scope fragment* (merged after `buildWhere`) rather than a declared range filter, specifically to bypass the factory's `Number()` coercion which is correct for numeric bounds but wrong for `Date`.
- `ownEntriesPage` reads the cursor *before* calling `base.normalize(rows)`, because normalisation mutates rows in place (rewrites `timestamp` to a string, removes `_id`) and the cursor logic needs the raw stored values.
- The final export is a four-member object, not a re-export of `base`. Any accidental call to `base.save` or `base.deleteOne` from a consumer would be a compile error.
