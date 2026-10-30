---
source: src/modules/delivery/services/slip.ts
sha256: 9d6c48defb40e948b458f0af8b939a5446a0efc90823f35ed73c0088ac344e02
generated_at: 2026-10-29T03:44:24.534910+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/slip.ts

## Purpose

Listener for `product.release_date_changed` and `product.restock_date_changed` events. When a product's release or restock date moves, this module determines the new expected date for every fulfillment order still waiting on that product and decides what the buyer is owed (nothing, or an email with a cancel option), applying the result inside a per-order transaction.

## Key elements

- **`onDateChanged(productId, cause)`** *(exported)* — Entry point. Finds all waiting fulfillment orders for the given product and cause, then judges them sequentially (each in its own transaction).
- **`judgeOne(fulfillmentOrderId)`** *(internal)* — Wraps a single judgement in `runAct`: loads the order in the session, computes the new expected date, calls `judgeMove`, and delegates to `apply`.
- **`apply(fulfillmentOrder, verdict, next, now, session)`** *(internal)* — Executes the verdict. For `'earlier'`: updates `expectedAt` via `fulfillmentOrderRepository.claim` and records the timeline entry (no email). For later/cleared: calls `recordNotice` (email + cancel option), then records the timeline entry.
- **`expectedFrom(fulfillmentOrder)`** *(internal)* — Reads the product catalogue (`productService.findManyByIds`) to resolve the current expected date for the order, choosing `releaseDate` or `restockDate` based on the order's `cause`.
- **`recordDateMoved(fulfillmentOrder, next, now, session)`** *(internal)* — Appends a `release_date_moved` entry to the order's timeline via `orderService.appendTimeline`. The `from`/`to` keys are conditionally present.

## Relationships

- **`../domain` (preorder.ts, fulfillment.ts via index.ts)** — Provides the pure decision logic: `judgeMove`, `expectedDateOfWaiting`, and the `SlipVerdict`/`WaitCause` types. This file is the side-effectful layer around that table.
- **`../repository.ts`** — `fulfillmentOrderRepository` supplies `findWaitingForProduct`, `findInSession`, and `claim` (optimistic-concurrency update).
- **`../model.ts`** — `FulfillmentOrderDocument` type used throughout.
- **`./act.ts`** — `runAct` provides the per-order Mongoose transaction wrapper.
- **`./notice.ts`** — `recordNotice` sends the buyer email / cancel-option notice; `SentNotice` is the return type threaded through `apply` and `judgeOne`.
- **`@modules/orders`** — `orderService.appendTimeline` writes the `release_date_moved` timeline entry. Delivery mediates this because `orders` already imports `products`, making a direct `orders ← products` event listener a circular dependency.
- **`@modules/products`** — `productService.findManyByIds` reads the current catalogue dates (the event payload's date is deliberately *not* trusted).
- **`./index.ts`** — Re-exports `onDateChanged` for the module's public API.

## Notes

- **Idempotent by design.** The outbox delivers at-least-once. A redelivered event finds the order's `expectedAt` already matching (or no expected date left for a cleared date) and `judgeMove` returns no verdict, so nothing is written.
- **Sequential, not parallel.** `onDateChanged` loops with `await` over each waiting order. Each iteration is an independent transaction; a failure in one does not roll back the others, but the outbox redelivery covers it.
- **Date source is the catalogue, not the event.** `expectedFrom` re-reads products via `productService`, so a multi-product fulfillment order still resolves correctly when one of its products moves earlier than another.
- **Conditional timeline keys.** `from` and `to` in the `release_date_moved` timeline entry are spread in only when the corresponding date exists; an absent key signals "no date" rather than `null`.
- **Email only for bad news.** An `'earlier'` verdict (date moved up or stayed) writes only the timeline row. The buyer sees the new date on the order page without receiving a notice.
