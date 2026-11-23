---
source: src/modules/delivery/services/notice.ts
source_sha256: cbf97f1da3c808cf48974a9053fd1d0569c0fcf80b570817f800d409554d73f1
context_sha256: 20517eb9a71342faf13c3b939d0a0bfa3b922addb5937ff772bbbad5af616866
generated_at: 2026-11-22T04:56:03.318958+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/services/notice.ts

## Purpose
Builds and records the notice telling a preorder's buyer that their date moved or will be missed. It is the single place the notice is built. Two triggers use it: an admin moving the release date (`moved`) and the daily sweep finding a date that will be missed (`due`). The fulfillment order's new state and the event are written in the caller's transaction. The email follows the commit.

## Key elements
- `NoticeInput` – what a notice says. `reason` is `moved` or `due`, taken from `FulfillmentOrderDelayed['reason']`. `expectedAt` is optional: a `Date` sets the new date, `null` clears it, and absent leaves it alone.
- `SentNotice` – the result of a recorded notice, holding the updated `fulfillmentOrder`.
- `payloadOf` (internal) – builds the `FulfillmentOrderDelayed` event payload. It includes the order id and number, the fulfillment order id, the optional buyer id, line titles, `agreedAt` (epoch 0 if missing), the previous `promisedAt`, the ship country, and the new `expectedAt`. The optional fields are omitted when absent.
- `recordNotice(fulfillmentOrder, input, now, session)` – the exported entry point:
  1. Reads the order. Returns `undefined` if it is missing.
  2. Computes the promise via `promisedAfterNotice`.
  3. Builds a patch that stamps `lastNoticeAt`. For `due` notices it also sets `dueNoticeFor` to the current `expectedAt`. It sets or unsets `expectedAt`, and sets or unsets `promisedAt`.
  4. Writes the patch conditionally on the revision the caller read.
  5. Calls `announceDelayed` with the payload, then returns `{ fulfillmentOrder: claimed }`.

## Relationships
- `src/modules/delivery/domain/index.ts` – supplies `promisedAfterNotice`, which decides the promised date after a notice.
- `src/modules/delivery/repository.ts` – exports `fulfillmentOrderRepository`, used for the revision-conditional write, and the `FulfillmentOrderPatch` type for the patch.
- `src/modules/delivery/model.ts` and `src/modules/delivery/events.ts` – supply the `FulfillmentOrderDocument` and `FulfillmentOrderDelayed` types.
- `src/modules/delivery/services/announce.ts` – `announceDelayed` publishes the event inside the same session.
- `src/modules/orders/index.ts` – exports `orderService` (used to read the order and its shipping address), `buyerIdOf`, and the `OrderDocument` type, which supply the order data for the payload.
- The module docs describe the sweep (`src/modules/delivery/services/preorder-sweep.ts`) and the admin date edit as the callers. Neither file's content is visible here, so this page does not describe how they call it.

## Notes
- The write is conditional on `fulfillmentOrder.revision`. If a ship or allocation raced it, the write fails and `recordNotice` returns `undefined`, so no notice is sent. Callers must handle `undefined`.
- `dueNoticeFor` is the sweep's dedupe. A given date is reported once, and a moved date can be reported again.
- A `null` `expectedAt` unsets `expectedAt`, and also `promisedAt` when `promised === null`. The event then carries no `expectedAt`.
- The notice never asks the buyer anything. Silence keeps them waiting.
- The caller must pass its own `session`. The function does not open a transaction.
