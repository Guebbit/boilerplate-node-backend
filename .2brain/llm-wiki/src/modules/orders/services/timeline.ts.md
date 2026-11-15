---
source: src/modules/orders/services/timeline.ts
sha256: 85e2ef009c18dbbe063c152aa7efd82fe36d008c838ff46c26828adfbc0cc478
generated_at: 2026-11-14T20:48:12.273776+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/timeline.ts

## Purpose

Implements the order timeline — an append-only, ordered log of everything that happened to an order. It exposes the single write door (`appendTimeline`) that both `orders` itself and dependent modules (payments, delivery, returns, invoicing) use to record events inside their own transactions, plus all read, note-management, and lifecycle functions (GDPR export, erasure, retention scrub, hard delete) for that log.

## Key elements

- **`appendTimeline`** (exported) — The public write entry-point. Persists one `TimelineEntryInput` row via `insertRow` inside the caller's open transaction. Returns void.
- **`withTimeline`** (exported) — Higher-order wrapper: runs a conditional write; only if it matched (non-null) does it append the derived rows in the same transaction. Prevents orphan timeline rows on a lost race.
- **`addNote`** (exported) — Staff adds a note. Own transaction, returns `201` with the presented entry or `404`. Records an audit row with note length (never text).
- **`deleteNote`** (exported) — Soft-deletes a note (unsets text, row stays). Returns `204` or `404`. Decrypts the text only to read its length for the audit row.
- **`readTimeline`** (exported) — Paginated read, newest first. Filters to `BUYER_VISIBLE_TYPES` for buyers; staff see all rows and actors.
- **`collectTimelineOf`** (exported) — Gathers every timeline row across an account's orders for `POST /account/export`. Includes staff text and staff-only rows, but restores `actor` only if it is the exporting user.
- **`clearTimelineActor`** (exported) — Erases the actor reference for a deleted account (GDPR). Runs in the erasure's transaction.
- **`scrubTimelineText`** (exported) — Second sweep of `reap:orders`: unsets free text on rows older than the configured retention. Logs via `logger.info` when count > 0.
- **`deleteTimelineOf`** (exported, `@internal`) — Hard-deletes all rows for a removed order. Only the orders module's own removal path may call it.
- **`insertRow`** (private) — Persists one row; encrypts `note_added` text with PII encryption (AAD = order id) before writing.
- **`appendTimelineAll`** (private) — Appends multiple rows **sequentially** (mongoose sessions reject parallel ops; rows must keep given order).
- **`readsEveryOrder`** (private) — Returns true when the caller holds the `display:Order` ability (staff), as opposed to the shared `read:Order`.

## Relationships

- **`src/modules/orders/domain/index.ts`** — Provides `BUYER_VISIBLE_TYPES` (buyer-read filter) and the `TimelineEntryInput` union used by every write path.
- **`src/modules/orders/audit.ts`** — Supplies `ordersAuditActions` constants for the `recordAudit` calls in `addNote`/`deleteNote`.
- **`src/modules/orders/config.ts`** — Supplies `orderEventTextRetentionDays()` for the retention cutoff in `scrubTimelineText`.
- **`src/infrastructure/security/pii-encryption.ts`** — `encryptPii` / `decryptPii` protect staff note text at rest and in audit metadata.
- **`src/infrastructure/http/response.ts`** — `generateSuccess` / `generateReject` shape the `addNote` / `deleteNote` HTTP responses.
- **`src/infrastructure/i18n/index.ts`** — `t()` localises the `404` message in `addNote` / `deleteNote`.
- **`src/infrastructure/observability/audit.ts`** — `recordAudit` writes the audit trail for note add/delete.
- **`src/infrastructure/runtime/database.ts`** — `withTransaction` wraps `addNote` in its own transaction.
- **`src/infrastructure/persistence/create-repository.ts`** — `toObjectId` converts string ids for Mongoose in `insertRow`.
- **`src/infrastructure/persistence/search.ts`** — `normalizePagination`, `buildPaginatedMeta`, and the `PaginationInput` / `PaginatedMeta` types back `readTimeline`.
- **`src/kernel/ability.ts`** — `heldRules` powers the staff-vs-buyer reader check.
- **`src/kernel/permissions.ts`** — `callerForSubject` builds the subject key for the `heldRules` lookup.
- **`src/domain-primitives/time.ts`** — `DAY_MS` converts the retention-days config into a millisecond cutoff.

## Notes

- **Two-writer, one-door design.** `orders` writes its own rows inside its own transaction; dependent modules call `appendTimeline` inside *their* transaction. The reverse direction is impossible because they import `orders`, so an event-listener would create a cycle.
- **`withTimeline` is atomic with the write.** If the conditional write returns `null` (lost race, wrong state), no timeline rows are appended.
- **Staff note text is PII-encrypted** with the order id as AAD. The presenter decrypts for display; audit rows store only the length.
- **`readTimeline` uses `display:Order` (ability), not `read:Order` (CASL action)**, because both buyers and staff hold `read:Order`; the distinguishing held key is `display:Order`.
- **`collectTimelineOf` is an export, not a view.** It includes staff text and staff-only row types (GDPR: the data belongs to the buyer), but the `actor` field is only restored when it matches the exporting user — shop staff identity stays in the audit log.
- **`deleteTimelineOf` is `@internal`.** It is deliberately not exposed on `orderService`; only the orders module's own hard-delete path may call it.
- **`scrubTimelineText` unsets text but preserves the row, type, and `data` codes.** It is the second sweep of the `reap:orders` job (first sweep likely deletes the order itself).
