---
source: src/modules/orders/services/timeline.ts
sha256: c9992e2de4911ad3a342a7dfa8330c0d2cf65172998689edd7fd3c8b2b3f9922
generated_at: 2026-11-08T07:02:03.699838+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/timeline.ts

## Purpose

Manages the order timeline — the ordered log of what happened to an order. Implements a "two writers, one door" pattern: the orders module appends its own rows inside its own transaction, while dependent modules (payments, delivery, returns, invoicing) call `appendTimeline` inside *their* transaction. This avoids a circular dependency that would arise from event listening. Also handles staff-note CRUD, permission-scoped reads, GDPR data export, account-erasure scrubbing, and text retention.

## Key elements

- **`appendTimeline`** — Appends a single timeline row in the caller's open transaction; the row commits atomically with the fact it describes.
- **`withTimeline`** — Composes a conditional order write with timeline rows: rows are appended only if the write matched, all in one transaction.
- **`addNote`** — Staff action: inserts an encrypted `note_added` row in its own transaction, audits (length only), returns `201`.
- **`deleteNote`** — Staff action: unsets the note's text (row stays), audits, returns `204`. Unknown id / wrong order / already withdrawn all collapse to one `404`.
- **`readTimeline`** — Returns an order's timeline oldest-first, scoped by audience: staff see every row and actor; buyer sees only buyer-visible rows with no actor.
- **`collectTimelineOf`** — Gathers every timeline row across an account's own orders for `POST /account/export`. Includes staff text but suppresses non-self actors (Pankki S, C-579/21).
- **`clearTimelineActor`** — Erases the actor reference from rows authored by a deleted account; rows themselves remain.
- **`scrubTimelineText`** — Retention sweep: unsets free text on rows older than `orderEventTextRetentionDays`; returns the count scrubbed.
- **`deleteTimelineOf`** (`@internal`) — Deletes all rows for a hard-deleted order. Only the orders module's removal path may call it.
- **`readsEveryOrder`** (private) — Checks the `display:Order` held key (not `read:Order`) to decide staff-vs-buyer audience.
- **`insertRow`** (private) — Persists one row via `orderEventRepository.create`; encrypts `note_added` text with `timelineNoteAad(orderId)` as PII AAD.

## Relationships

- **`src/domain-primitives/time.ts`** — Provides `DAY_MS` used in the retention-window calculation in `scrubTimelineText`.
- **`src/infrastructure/adapters/logger.ts`** — Provides `logger` for the retention-sweep info log.
- **`src/infrastructure/http/response.ts`** — Provides `generateReject` / `generateSuccess` for the HTTP-shaped return values of `addNote` and `deleteNote`.
- **`src/infrastructure/i18n/index.ts`** — Provides `t()` for localized error messages (e.g. `orders.not-found`).
- **`src/infrastructure/observability/audit.ts`** — Provides `recordAudit` called after note add/delete.
- **`src/infrastructure/persistence/create-repository.ts`** — Provides `toObjectId` for Mongo id conversion in `insertRow`.
- **`src/infrastructure/runtime/database.ts`** — Provides `withTransaction` used by `addNote` (and available to `appendTimeline` callers).
- **`src/infrastructure/security/pii-encryption.ts`** — Provides `encryptPii` / `decryptPii` for staff-note text at rest.
- **`src/kernel/ability.ts`** — Provides `heldRules` used by `readsEveryOrder` to check the `display:Order` key.
- **`src/kernel/permissions.ts`** — Provides `callerForSubject` to build the subject passed to `heldRules`.
- **`src/modules/orders/audit.ts`** — Provides `ordersAuditActions` (action enum values for audit records).
- **`src/modules/orders/config.ts`** — Provides `orderEventTextRetentionDays` for the retention sweep.
- **`src/modules/orders/domain/index.ts`** — Provides the `TimelineEntryInput` type used by all write paths.
- **`src/modules/orders/domain/timeline.ts`** — Source of the timeline domain types that `domain/index.ts` re-exports.

## Notes

- **PII encryption scope:** Only `note_added` text is encrypted (keyed to the order ID via `timelineNoteAad`). All other entry types store `text` in plaintext. The presenter decrypts at read time.
- **Permission check subtlety:** `readsEveryOrder` deliberately uses the `display:Order` held key rather than `read:Order`. The latter is shared with buyers and would incorrectly grant the staff view.
- **Sequential writes:** `appendTimelineAll` (private) loops with `await` rather than `Promise.all` because Mongoose `ClientSession` does not support parallel operations and row order is semantically significant.
- **Audit discipline:** Audit metadata records note *length*, never note *text*, to avoid duplicating PII into the audit trail.
- **`deleteTimelineOf` is `@internal`:** It is intentionally not exposed on `orderService`; only the order-removal path within this module may invoke it.
- **Stryker suppression:** The `logger.info` line in `scrubTimelineText` has a `// Stryker disable next-line all` comment — do not "clean up" this; it prevents mutation testing from flagging the log call.
