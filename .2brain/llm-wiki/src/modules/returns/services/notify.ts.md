---
source: src/modules/returns/services/notify.ts
sha256: 4bd3701de1df7450f692a17e66d2e9fa0ee75867b222c27afa2c4642301fd0e8
generated_at: 2026-10-29T05:43:16.596408+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/services/notify.ts

## Purpose

Outbound customer-email handlers for the return lifecycle. It subscribes to the module's own domain events (`return.requested`, `return.decided`, `return.closed`) and queues a localized notice to the buyer via the order service's mail pipeline. Every handler is fire-and-forget: a failed mail is logged and swallowed so the event relay never redelivers.

## Key elements

- **`withReturn(returnId, send)`** – Internal loader. Fetches the `ReturnDocument` by ID, calls `send` if found, and catches any error into `logger.error`. Returns a resolved promise in all paths.
- **`sendNotice(kind, found, input)`** – Internal sender. Resolves the buyer's locale and name through `orderService.mailBuyerOfOrder`, builds the email with `returnNoticeEmail`, and queues it via `enqueueEmail`.
- **`mailReturnRequested`** *(exported)* – Listener for `return.requested`. Sends a withdrawal acknowledgement (Art. 11a) or a plain "received" notice. Suppresses the mail entirely when staff opened a non-withdrawal return (that path is covered by `return.decided`). Omits postage/address for born-closed returns.
- **`decidedNoticeOf(found, decision)`** – Internal mapper: `declined → 'return-declined'`, `approved + staff-opened → 'return-opened'`, otherwise `'return-approved'`.
- **`mailReturnDecided`** *(exported)* – Listener for `return.decided`. Sends approval, decline, or staff-opened notice with postage, decline reason, and (on approval) the return address.
- **`closedNoticeOf(remedy)`** – Internal mapper: `replace → 'return-replaced'`, `repair → 'return-repaired'`, else `'return-closed'`.
- **`mailReturnClosed`** *(exported)* – Listener for `return.closed`. Sends the refund/replacement/repair notice, but only when `found.receivedAt` is set (skips born-closed returns whose refund is covered by the `payments` module).

## Relationships

- **`@infrastructure/adapters/logger`** – `withReturn` logs an error and the return ID when the repository lookup or send fails.
- **`@infrastructure/adapters/mailer`** – `sendNotice` calls `enqueueEmail` to hand the composed mail to the delivery queue.
- **`@kernel/events`** – Provides the `DomainEventMap` type used to type each listener's payload.
- **`@modules/orders`** (`orderService.mailBuyerOfOrder`) – Looks up the buyer's email, locale, and display name for a given order so the copy is localized.
- **`@modules/shop`** (`returnAddress`) – Supplies the shop's physical return address included in approval and withdrawal-acknowledgement mails.
- **`../domain`** (`isGuaranteeReason`) – Determines whether a remedy-choice line (repair/replacement) is shown in the notice.
- **`../emails`** (`returnNoticeEmail`, `ReturnNoticeInput`, `ReturnNoticeKind`) – Constructs the subject, template, and data for each notice kind.
- **`../repository`** (`returnRepository.findById`) – Loads the current `ReturnDocument` snapshot for the event's return.
- **`../model`** (`ReturnDocument`) – The data shape every handler reads (reason, openedBy, postage, timestamps, etc.).

## Notes

- **Error-swallowing is intentional.** A listener that rejects would cause the event relay to redeliver; a failed mail is not worth that. Both `withReturn`'s catch and the `void` on `enqueueEmail` exist to guarantee resolution.
- **Stryker mutators are disabled** inside the `.catch` block of `withReturn` (the mutation would make a swallowed error re-throw, breaking the no-redelivery contract).
- **Timestamp semantics differ by event.** `mailReturnRequested` uses `found.requestedAt` (the buyer's action date), while `mailReturnDecided` uses `found.requestedAt` only when staff opened the return, otherwise `found.decidedAt`.
- **Staff-opened, non-withdrawal returns skip the `return.requested` mail entirely**; the customer hears about it for the first time via `mailReturnDecided` (`'return-opened'` kind).
- **Born-closed returns** (withdrawal before dispatch, remainder cancel) get a lighter acknowledgement (no postage line, no return address) and are excluded from `mailReturnClosed`.
