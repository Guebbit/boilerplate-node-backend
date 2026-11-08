---
source: src/modules/delivery/services/slip.ts
sha256: 84d7bae5a158e6f2a650ff2f2a53b45f62dcb4b253761760b1ee8378c5981876
generated_at: 2026-11-08T05:40:18.561350+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/slip.ts

## Purpose

Listener for `product.release_date_changed` and `product.restock_date_changed` events. For every fulfillment order still waiting on the affected product, it determines the new expected date from the live catalogue and applies the pure verdict table from `domain/preorder.ts`: if the date moved earlier (or is unchanged) the order is silently updated; if it moved later or was cleared, the buyer receives an email and a cancel option. The handler is idempotent so at-least-once outbox redelivery is safe.

## Key elements

- **`onDateChanged(productId, cause)`** *(exported)* — Entry point. Finds all waiting fulfillment orders for the product and cause, then judges them sequentially, each in its own transaction.
- **`judgeOne(fulfillmentOrderId)`** — Wraps a single order's read → judge → apply cycle inside `runAct`. Returns a `SentNotice` (or `undefined`) for post-commit dispatch.
- **`apply(fulfillmentOrder, verdict, next, now, session)`** — Branches on verdict: `earlier` → claim the new date and record the timeline entry; otherwise → `recordNotice` then `recordDateMoved`.
- **`recordDateMoved(fulfillmentOrder, next, now, session)`** — Appends a `release_date_moved` entry to the order's timeline via `orderService.appendTimeline`. `from`/`to` keys are present only when the corresponding date exists.
- **`expectedFrom(fulfillmentOrder)`** — Reads the current release/restock dates for all line items from `productService.findManyByIds`, then delegates to `expectedDateOfWaiting` so the expected date always reflects the catalogue, not the event payload.

## Relationships

| Neighbor | Interaction |
|---|---|
| `delivery/domain/index.ts` | Imports `expectedDateOfWaiting`, `judgeMove`, and the `SlipVerdict` / `WaitCause` types (the pure decision table). |
| `delivery/repository.ts` | Uses `fulfillmentOrderRepository` to find waiting orders, read them in-session, and `claim` a revision. |
| `delivery/model.ts` | `FulfillmentOrderDocument` type for all order reads. |
| `delivery/services/act.ts` | `runAct` provides the per-order transaction boundary. |
| `delivery/services/notice.ts` | `recordNotice` sends the buyer email; `SentNotice` type for the return value. |
| `orders/index.ts` | `orderService.appendTimeline` writes the `release_date_moved` timeline row. |
| `products/index.ts` | `productService.findManyByIds` fetches live release/restock dates. |
| `shop/index.ts` | `shopDayOf` and `shopTimezone` for human-readable dates in the timeline and the judge. |

## Notes

- **Sequential, not parallel:** `onDateChanged` iterates with `for…await`; each order is an independent transaction, and the buyer's mail rides that commit's event. This is intentional — concurrent claims on overlapping orders could conflict.
- **Idempotency mechanism:** On a redelivered event the catalogue date already matches `expectedAt`, so `judgeMove` returns no verdict (or `earlier` with an unchanged date) and no write occurs. For a cleared date, `expectedFrom` returns `undefined`, which also yields no action.
- **Catalogue as source of truth:** `expectedFrom` deliberately re-reads product dates rather than trusting the event payload, so a multi-product group stays correct when one member moves.
- **`recordDateMoved` guard:** It is only reached after a successful `claim` (earlier path) or after `recordNotice` actually sent (later path), preventing duplicate timeline rows on redelivery.
