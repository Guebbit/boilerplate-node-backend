---
source: src/modules/delivery/services/notice.ts
sha256: dadd3741cee5ceb32b51ff6489561f8b7fe897c14bdaba84b7433b71bed41360
generated_at: 2026-11-14T19:48:00.867151+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/notice.ts

## Purpose

Single point where a preorder's buyer is notified that their delivery date moved (admin edit) or will be missed (daily sweep). It stamps the fulfillment order with notice metadata, applies the new/cleared expected date, records the `FulfillmentOrderDelayed` event, and delegates the actual announcement to the announce service — all within the caller's Mongoose transaction.

## Key elements

- **`NoticeInput`** (exported interface) — Caller-decided notice shape: `reason` (`'moved'` | `'due'`) and optional `expectedAt` (`Date` to move, `null` to clear, `undefined` to leave alone).
- **`SentNotice`** (exported interface) — Return value: the fulfillment order document as written.
- **`recordNotice`** (exported function) — Main entry point. Reads the parent order, computes the post-notice `promisedAt`, builds a `FulfillmentOrderPatch`, performs a revision-checked `claim` write via the repository, then calls `announceDelayed` with the event payload. Returns `undefined` if the claim (optimistic concurrency) fails.
- **`payloadOf`** (module-private) — Assembles the `FulfillmentOrderDelayed` event object from the fulfillment order, order, input, and the pre-notice `promisedAt`.

## Relationships

- **`src/modules/delivery/domain/index.ts`** — Provides `promisedAfterNotice`, which computes the updated `promisedAt` given the current value and the new `expectedAt`.
- **`src/modules/delivery/repository.ts`** — `fulfillmentOrderRepository` performs the revision-guarded `claim` write; `FulfillmentOrderPatch` types the patch.
- **`src/modules/delivery/model.ts`** — `FulfillmentOrderDocument` type used throughout.
- **`src/modules/delivery/events.ts`** — `FulfillmentOrderDelayed` is the event shape that `payloadOf` constructs.
- **`src/modules/delivery/services/announce.ts`** — `announceDelayed` receives the payload and `session` to dispatch the announcement within the transaction.
- **`src/modules/orders/index.ts`** — `orderService` provides `readOrder` to fetch the parent order; `buyerIdOf` extracts the buyer's user ID for the event payload.
- **`src/modules/orders/model.ts`** — `OrderDocument` type of the parent order.

## Notes

- **Optimistic concurrency:** `recordNotice` passes `fulfillmentOrder.revision` to `claim`. If the order was shipped or allocated between the caller's read and this write, `claim` returns falsy and the notice is silently dropped — no error, no email.
- **Sweep dedupe:** When `reason` is `'due'`, the patch sets `dueNoticeFor` to the *current* `expectedAt`, preventing the daily sweep from re-noticing the same date. A subsequent `moved` notice (different date) will still fire.
- **Cleared dates:** Passing `expectedAt: null` unsets both `expectedAt` and (if `promisedAfterNotice` returns `null`) `promisedAt` from the document, so a later redelivery sweep finds nothing to track.
- **Email timing:** The top-level doc comment states "the email follows the commit," yet `announceDelayed` is called with the `session` argument inside the transaction. The announcement is therefore recorded atomically; actual delivery is presumably triggered post-commit by the announce layer.
