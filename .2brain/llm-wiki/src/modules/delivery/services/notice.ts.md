---
source: src/modules/delivery/services/notice.ts
sha256: 78a7ce408c7b40ad25d2479a9094a69692f89c2d313383605526222b628aaba2
generated_at: 2026-10-14T15:30:49.852574+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/notice.ts

## Purpose

Single place that builds and records a "your date moved or passed" notice on a fulfillment order. Two callers trigger it (an admin changing the release date, or the daily sweep detecting a passed date); both perform their state write and event in one transaction, and the buyer's email is sent only after that transaction commits.

## Key elements

- **`NoticeInput`** (exported interface) — what the caller decides the notice says: `reason` (`moved` | `passed`), optional `expectedAt`, `needsAnswer`, `countsAsSlip`.
- **`SentNotice`** (exported interface) — the post-transaction bundle (`fulfillmentOrder`, `order`, `delayed` event) handed to the mail step.
- **`payloadOf`** (private) — assembles the `FulfillmentOrderDelayed` event object from the claimed fulfillment order, the parent order, the input, and the computed answer deadline.
- **`recordNotice`** (exported) — reads the order via `orderService`, computes the 30-day answer deadline when `needsAnswer` is set, builds the patch (`lastNoticeAt`, optional `expectedAt`/`slips`/`consent`/`consentDeadline`), atomically claims the document via `fulfillmentOrderRepository.claim` (optimistic concurrency on `revision`), calls `announceDelayed` in-transaction, and returns `SentNotice` or `undefined` if the document was already modified.
- **`mailNotice`** (exported) — post-commit dispatch: calls `notifyDelayed` with the `SentNotice`; a no-op (resolved promise) when the input is `undefined`.

## Relationships

- **`../domain`** (`answerBy`) — computes the 30-day answer deadline from the notice instant.
- **`../repository`** (`fulfillmentOrderRepository.claim`, `FulfillmentOrderPatch`) — performs the revision-conditional write that makes the notice durable.
- **`./announce`** (`announceDelayed`) — writes the `FulfillmentOrderDelayed` domain event inside the same transaction.
- **`./notify`** (`notifyDelayed`) — sends the buyer's email after the transaction commits.
- **`@modules/orders`** (`orderService`, `OrderDocument`) — reads the parent order to attach `userId` and pass to the mail step.
- **`../events`** (`FulfillmentOrderDelayed`) — type of the event payload.
- **`../model`** (`FulfillmentOrderDocument`) — the fulfillment order shape read and returned.
- **`@types`** (`FulfillmentConsent`) — the `awaiting` consent state set when the buyer must answer.

## Notes

- **Optimistic concurrency guard:** `recordNotice` passes `fulfillmentOrder.revision` to `claim`. If a ship, allocation, or another notice wins the race, `claim` returns falsy and the function exits with `undefined` — no event, no mail, no state change.
- **Mail is best-effort:** `mailNotice` is called after the commit; a delivery failure never rolls back the already-persisted notice.
- **`countsAsSlip` vs. `needsAnswer`:** the sweep's `passed` reason sets `countsAsSlip: false` (the buyer was not proactively told a date moved), while an admin's `moved` edit sets it `true`. `needsAnswer` is independent and controls whether the consent window opens.
- **`lastNoticeAt` is the sweep's idempotency stamp** — the daily sweep checks it to avoid re-noticing the same order.
- **`expectedAt` is additive:** clearing a date does not write a new value into the document; the stored date simply remains but is no longer surfaced in the event payload.
