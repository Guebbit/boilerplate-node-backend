---
source: src/modules/delivery/services/notice.ts
sha256: 683faff8fcc187975ccebdf93310fbcb4b782ddea3644d54df41376ef2c5a6b2
generated_at: 2026-10-29T03:41:11.771506+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/notice.ts

## Purpose

Single place where a preorder date-change notice is built, recorded, and announced. It serves two entry points — an admin moving the release date and the daily sweep detecting a missed date — and writes the fulfillment-order state change plus the delayed event in one transaction, deferring the buyer-facing email to after commit.

## Key elements

- **`NoticeInput`** (exported interface) — caller's decision: `reason` (`'moved'` | `'due'`) and optional `expectedAt` (`Date`, `null` to clear, or absent to leave as-is).
- **`SentNotice`** (exported interface) — returned on success; carries the updated `FulfillmentOrderDocument`.
- **`payloadOf`** (internal) — assembles the `FulfillmentOrderDelayed` event payload from the fulfillment order, the buyer's order, the input, and the previously promised date.
- **`recordNotice`** (exported async function) — main entry point. Reads the order, computes the new `promisedAt` via `promisedAfterNotice`, builds a conditional patch (stamps `lastNoticeAt`, `dueNoticeFor` for sweep dedup, moves or unsets `expectedAt`/`promisedAt`), claims it with optimistic concurrency, then fires `announceDelayed`. Returns `undefined` if the claim lost a race.

## Relationships

- **`src/modules/delivery/domain/index.ts`** — imports `promisedAfterNotice` to derive the new promised date after the notice.
- **`src/modules/delivery/repository.ts`** — calls `fulfillmentOrderRepository.claim` for the revision-guarded write; uses `FulfillmentOrderPatch` type.
- **`src/modules/delivery/model.ts`** — consumes `FulfillmentOrderDocument` as the domain record.
- **`src/modules/delivery/events.ts`** — uses `FulfillmentOrderDelayed` as the event shape for `payloadOf`.
- **`src/modules/delivery/services/announce.ts`** — calls `announceDelayed` to schedule the post-commit email.
- **`src/modules/orders/index.ts`** — imports `orderService` (to read the order, get shipping country) and `buyerIdOf` (to include `userId` in the event).
- **`src/modules/orders/model.ts`** — uses `OrderDocument` type (re-exported via the orders index).
- **Callers (upstream):** `src/modules/delivery/services/preorder-sweep.ts` (sweep path, `reason: 'due'`) and `src/modules/delivery/services/slip.ts` (admin edit path, `reason: 'moved'`) both invoke `recordNotice` inside their own transaction.

## Notes

- **Optimistic concurrency:** `claim` is guarded by `fulfillmentOrder.revision`. If a shipment or allocation committed first, the notice is silently skipped (returns `undefined`) — no error, no retry.
- **Sweep dedup:** `dueNoticeFor` records the specific date that was already notified, preventing the sweep from re-notifying the same missed date on subsequent runs.
- **Clearing a date:** `expectedAt: null` triggers a MongoDB `unset` of `expectedAt` (and `promisedAt` if it also resolves to null), so a later redelivery finds nothing to move.
- **`agreedAt` sentinel:** falls back to epoch (`new Date(0)`) in the event payload when the fulfillment order has no agreed date — downstream consumers must treat that as "no date was ever set."
- **The email is not sent inline:** `announceDelayed` receives the caller's `session`, implying the actual send is queued and executed after the transaction commits.
