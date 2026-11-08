---
source: src/modules/returns/services/notify.ts
sha256: 4bd3701de1df7450f692a17e66d2e9fa0ee75867b222c27afa2c4642301fd0e8
generated_at: 2026-11-08T08:04:12.526778+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/services/notify.ts

## Purpose
Event listeners that email the customer at each return lifecycle stage—requested, decided, closed. Each listener loads the return, picks the right notice kind and copy, and enqueues a localized email via the buyer lookup in the orders module. All failures are logged and swallowed so that a mail outage never blocks or replays the underlying event.

## Key elements
- **`withReturn(returnId, send)`** — loads a `ReturnDocument` by ID and invokes the callback; catches all errors and logs them. Never rejects.
- **`sendNotice(kind, found, input)`** — delegates to `orderService.mailBuyerOfOrder` to resolve buyer locale/name/email, builds the email via `returnNoticeEmail`, and calls `enqueueEmail`.
- **`mailReturnRequested`** *(exported)* — listener for `return.requested`. Skips buyer mail when staff opened a non-withdrawal return. Chooses between `withdrawal-acknowledged`, `withdrawal-recorded`, or `return-requested` kind. Includes `returnAddress` only for withdrawals (goods go back immediately) and `remedyChoice` only for guarantee reasons.
- **`mailReturnDecided`** *(exported)* — listener for `return.decided`. Maps decision + `openedBy` to `return-declined`, `return-approved`, or `return-opened`. Includes `returnAddress` on approval, `declineReason`/`declineMessage` on decline.
- **`mailReturnClosed`** *(exported)* — listener for `return.closed`. Maps remedy to `return-closed`, `return-replaced`, or `return-repaired`. Skips mail entirely when `receivedAt` is absent (born-closed returns already acknowledged at open; their refund notice comes from `payments`).
- **`decidedNoticeOf`** / **`closedNoticeOf`** — small internal mappers from (decision, openedBy) / remedy to `ReturnNoticeKind`.

## Relationships
- **`@infrastructure/adapters/logger`** — `logger.error` on any fetch failure in `withReturn`.
- **`@infrastructure/adapters/mailer`** — `enqueueEmail` is the sole transport; called once per notice inside `sendNotice`.
- **`@kernel/events`** — provides `DomainEventMap` for typed event payloads.
- **`@modules/orders`** (`orderService`) — `mailBuyerOfOrder` resolves the buyer's locale, name, and email from the order; this module supplies the email template and data.
- **`@modules/shop`** (`returnAddress`) — returns the shop's physical mailing address for the return-postage block.
- **`../domain`** (`isGuaranteeReason`) — determines whether the copy offers a remedy-choice paragraph.
- **`../emails`** — `returnNoticeEmail` builds subject + template + data; `ReturnNoticeKind` and `ReturnNoticeInput` are the shared shape.
- **`../repository`** (`returnRepository.findById`) — loads the current return document.
- **`../model`** — `ReturnDocument` type used throughout.
- **`../services/index.ts`** — re-exports the three listener functions so the event relay can subscribe.

## Notes
- **No-throw guarantee is intentional.** A rejecting event listener triggers redelivery; a failed email is not worth replaying the business event. Both `withReturn` and `enqueueEmail` swallow errors by design.
- **`void` + eslint-disable on `enqueueEmail`.** The call is fire-and-forget; the adapter logs its own failures.
- **Date semantics.** The customer-facing `at` is always the buyer's action time (`requestedAt`), not the shop's `createdAt` or `decidedAt`.
- **Born-closed returns** (withdrawal before dispatch, remainder cancel) skip the standard "received" mail and the closed mail; they only get the withdrawal acknowledgement (or none, if staff-opened).
- **Staff-opened non-withdrawal returns** produce no mail on `return.requested`; the customer is informed once via `return.decided` with the `return-opened` notice.
