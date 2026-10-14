---
source: src/modules/delivery/services/slip.ts
sha256: a25e5723849df15c48c32b9e1ba5363a669a605f9e31a021efa6d811f1e3b556
generated_at: 2026-10-14T15:33:51.181004+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/slip.ts

## Purpose

Listener for the `product.release_date_changed` event. When a product's release date moves, this file finds every fulfillment order still waiting for it, computes the new expected date from the catalogue, applies the pure verdict from `judgeSlip`, and acts within a transaction (update date, record a notice, or ask the buyer). It is the delivery-side narrator because `orders` cannot subscribe to `products` directly (import direction).

## Key elements

- **`expectedFrom(fulfillmentOrder)`** – Reads the catalogue via `productService.findManyByIds` for the order's remaining lines and returns the latest `releaseDate` (or `undefined`). Reads from the catalogue, not the event payload, so multi-product orders stay correct when one product moves earlier.
- **`recordDateMoved(fulfillmentOrder, next, now, session)`** – Appends a `release_date_moved` entry to the order timeline via `orderService.appendTimeline`. Called only when the date actually changed, keeping redelivered events from writing a second row.
- **`apply(fulfillmentOrder, verdict, next, now, session)`** – Branches on `SlipVerdict.kind`: `earlier` silently claims the new date; `notice`/`ask` record a notice (with `needsAnswer` for `ask`) and then stamps the timeline. Returns the `SentNotice` for post-commit mailing.
- **`judgeOne(fulfillmentOrderId)`** – Wraps the read → judge → apply sequence in a single `runAct` transaction. Skips orders lacking `agreedAt`/`expectedAt`. Returns `undefined` on refusal.
- **`onReleaseDateChanged(productId)`** *(exported)* – Entry point. Finds all waiting fulfillment orders for the product, then processes them **sequentially** (one transaction each), mailing after each commit.

## Relationships

- **`../domain` (preorder.ts via index)** – Imports `judgeSlip` (pure verdict table) and `remainingOfLine` (filter to active lines).
- **`../repository`** – `fulfillmentOrderRepository.findWaitingForProduct`, `.findInSession`, `.claim` for reads and optimistic-concurrency updates.
- **`../model`** – `FulfillmentOrderDocument` type.
- **`./act`** – `runAct` provides the per-order Mongoose session/transaction.
- **`./notice`** – `recordNotice` writes the notice row; `mailNotice` delivers after commit; `SentNotice` is the return shape.
- **`@modules/orders`** – `orderService.appendTimeline` writes the `release_date_moved` timeline entry.
- **`@modules/products`** – `productService.findManyByIds` fetches current `releaseDate` values.
- **`../module.ts`** – Registers `onReleaseDateChanged` as the event subscriber for `product.release_date_changed`.

## Notes

- **Idempotency is structural, not via a dedup key.** A redelivered event re-reads the catalogue, gets the same `next`, `judgeSlip` returns `earlier`, and the `claim` guard (date unchanged) prevents a second write. No outbox dedup table.
- **Sequential, not batched.** Each order is its own transaction; a slow order blocks the next. This is intentional — each buyer's mail follows its own commit.
- **`earlier` verdict sends no mail.** The buyer is not notified of good news; the date is silently followed and the timeline row is the only trace.
- **Timeline ordering.** `recordDateMoved` is stamped with the same `now` as the notice so the timeline row sorts *before* the notice row, even though it is written after it.
