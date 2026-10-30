---
source: src/modules/delivery/services/progress.ts
sha256: 6ba88a778522e8c2b481c0df628fe3a52e508e39737d22be5d083ea2494383aa
generated_at: 2026-10-29T03:42:28.585790+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/progress.ts

## Purpose

Synchronizes the `orders` record with delivery's fulfillment state inside an act's transaction. It recomputes the fulfillment summary from the actual records (never adjusts it) and asks `orders` to move status only when the summary justifies a transition. This file is the single point where delivery *requests* an order-status change; `orders` remains the only writer.

## Key elements

- **`ProgressReport`** (interface) — the shape of what `reportProgress` read and wrote: the post-write order, the computed summary, and the raw fulfillment orders / shipments.
- **`reportProgress(orderId, session)`** — loads fulfillment orders and shipments sequentially under the act's session, calls `summarize` to build a `FulfillmentReport`, then hands it to `orderService.recordFulfillmentProgress`. Refuses the act (409 `DELIVERY_NOT_SHIPPABLE`) if the order can no longer be fulfilled.
- **`startFulfilment(order, session, actor)`** — moves the order `paid → processing` if it is still in that state. No-op (silent) when the order has already moved past `paid`; refuses (409 `ORDER_NOT_PAID`) if `markProcessing` fails to land. Called before `reportProgress` so subsequent writes see `processing`.
- **`settleOrder(orderId, status, summary, at, session, actor?)`** — performs the terminal status move dictated by the summary: `processing → shipped`, `shipped → delivered`, the double-move `processing → delivered`, or `processing → undeliverable` (lost). No-op when units remain or nothing was shipped.
- **`expectMoved`** (private) — guard that refuses the act (409) if a status transition failed to land.

## Relationships

- **`src/modules/delivery/services/act.ts`** — imports `refuse` to abort the act on any failure path.
- **`src/modules/delivery/domain/index.ts`** — imports `summarize` (pure computation of `FulfillmentReport`) and the `FulfillmentReport` type.
- **`src/modules/delivery/model.ts`** — imports `FulfillmentOrderDocument` and `ShipmentDocument` types.
- **`src/modules/delivery/repository.ts`** — imports `fulfillmentOrderRepository` and `shipmentRepository` for the two reads.
- **Other delivery services** (`ship.ts`, `deliver.ts`, `cancel-remainder.ts`, `reship.ts`, `split.ts`, etc.) — consume `reportProgress`, `startFulfilment`, and `settleOrder` as shared steps within their respective act transactions (this file is the common progress-reporting sub-step they all share).

## Notes

- Reads are intentionally sequential (`.then` chain), not parallel: a Mongoose `ClientSession` does not support concurrent operations on the same session.
- `startFulfilment` is a *conditional* no-op: if the order is already past `paid`, it silently returns without refusing. This is deliberate — multiple services call it and only one will be in the right state.
- `settleOrder` contains a "double move" path (`processing → delivered` in one call) that covers digital fulfillments and the edge case of a remainder cancelled after all shipments arrived. The docstring table is the canonical reference for which transition fires when.
- The "ship racing a cancel" guard lives specifically in `reportProgress`: if `recordFulfillmentProgress` returns `null` (order was cancelled concurrently), the act is refused before any further writes.
- `orders` is the sole status writer; this file never writes status directly — it only calls `orderService.*` methods and refuses the act if the call does not land.
