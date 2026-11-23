---
source: src/modules/orders/services/timeline.ts
source_sha256: 8aaba4df88db2aa8f6275c7659f89219c8ba65b5c187d7a4fec49ef411b45e0d
context_sha256: dc5536f456c6758d02d3ab9a55a0b1421d657d2ca9c545899286d4f087bbca3a
generated_at: 2026-11-22T06:24:40.777756+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/services/timeline.ts

## Purpose
Manages an order's timeline: an ordered record of what happened to an order, readable by the buyer and by staff. It is the single entry point for writing timeline rows. `orders` appends its own moves, and modules that depend on `orders` (payments, delivery, returns, invoicing) call `appendTimeline` inside their own transactions, since `orders` cannot listen to them without creating an import cycle.

## Key elements
- `appendTimeline(orderId, entry, session)`: appends one row in the caller's transaction, so the row commits with the fact it describes or not at all.
- `withTimeline(write, rows)`: wraps a conditional status write. It appends the rows only if the write returned an order, so a lost race writes nothing.
- `addNote(orderId, text, context)`: staff adds a `note_added` row in its own transaction. Returns 201 with the entry, or 404 if the order is missing. It records an audit row with the note's length, not its text.
- `deleteNote(orderId, eventId, context)`: withdraws a staff note by unsetting its text (the row stays) via `clearNoteText`. Returns 204, or 404 if nothing matched. It audits the length of the withdrawn text.
- `readTimeline(orderId, authContext, pagination)`: returns one page of entries, newest first. Staff see all rows and actors. Buyers see only `BUYER_VISIBLE_TYPES` and no actor. `totalItems` counts only rows the caller may read.
- `collectTimelineOf(userId)`: every timeline row of the account's own orders, for `POST /account/export`. It includes staff text and staff-only rows, and keeps `actor` only when it is the exporting account.
- `clearTimelineActor(userId, session)`: removes the actor from rows made by an erased staff account.
- `scrubTimelineText()`: unsets the free text of rows older than the configured retention (`orderEventTextRetentionDays()`). It is the second sweep of `reap:orders`. Returns the number of rows scrubbed.
- `deleteTimelineOf(orderId)`: removes the timeline of a hard-deleted order. It is `@internal` and not on `orderService`.
- Non-exported: `insertRow` (encrypts `note_added` text and stores the row), `appendTimelineAll` (sequential appends), `readsEveryOrder` (staff check).

## Relationships
- **Persistence:** uses `orderEventRepository` and `orderRepository` from `../repository`, `toObjectId` from `create-repository`, and `normalizePagination`/`buildPaginatedMeta` from `persistence/search`. `withTransaction` from `runtime/database` wraps `addNote`.
- **PII:** `encryptPii`/`decryptPii` from `security/pii-encryption`, with `timelineNoteAad` from `../pii`, protect note text.
- **Authorization:** `callerForSubject` (`kernel/permissions`) and `heldRules` (`kernel/ability`) decide whether the caller is staff.
- **Responses and i18n:** `generateSuccess`/`generateReject` from `http/response`, and `t` from `i18n` for the not-found message.
- **Audit and logging:** `recordAudit` (`observability/audit`) with `ordersAuditActions` (`../audit`). `logger` records scrub counts.
- **Orders module:** `presentTimeline`/`presentTimelineEntry` from `../presenter`, `BUYER_VISIBLE_TYPES` and `TimelineEntryInput` from `../domain`, `orderEventTextRetentionDays` from `../config`, and `ownOrderIds` from `./read`.
- **Time:** `DAY_MS` from `domain-primitives/time` for the retention cutoff.

## Notes
- Staff note text is encrypted at write time in `insertRow`, with the order id as AAD, so no writer can store a plaintext note. The presenter decrypts it.
- Staff status is determined by holding the `display:Order` rule, not by the CASL action, because `read:Order` shares the action and would admit every buyer.
- `appendTimelineAll` appends sequentially, because a transaction session does not take parallel operations and row order must be kept.
- `data` in an entry should hold ids and codes, never a sibling module's free text.
- `readTimeline` assumes the order was already checked by the controller through `getForCaller`.
- In `collectTimelineOf`, actors are omitted for privacy (CJEU Pankki S, C-579/21). Only the exporting account's own id is restored, and who wrote a row stays in the audit log.
- `deleteNote` returns one 404 for an unknown id, a row of another order, another type, or an already-withdrawn note.
