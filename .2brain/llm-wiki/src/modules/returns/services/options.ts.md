---
source: src/modules/returns/services/options.ts
sha256: de1f09eb3df3b5369a665709b968f865a7f5115d12697290e8e3ef497299837a
generated_at: 2026-10-15T11:57:06.211452+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/services/options.ts

## Purpose

Computes, in a single server-side call, what an order can still **return** (shipped units not already heading back) and what it can still **cancel** (fulfillment orders with a remainder, plus the exact refund owed). Centralising this logic ensures no client re-derives quantities or refund amounts.

## Key elements

- **`getReturnOptions`** *(exported)* — Main entry point. Takes `orderId` + `AuthContext`, returns `ResponseSuccess<ReturnOptions>` or a 404 `ResponseReject`. Resolves the order, fetches existing returns, shipped quantities, and remainder options in parallel, then assembles the `returnable` and `cancellable` sections.
- **`readableOrder`** *(internal)* — Permission gate: staff holding `returns.any.read` may read any order; everyone else is limited to their own via `ownOrder`.
- **`optionLines`** *(internal)* — Formats a `productId → units` map into titled option lines, pulling the product title frozen on the order.

## Relationships

- **`@infrastructure/http/response`** — Shapes the API envelope via `generateSuccess` / `generateReject`.
- **`@infrastructure/i18n`** (`i18n/index.ts`) — Localises the 404 message with `t('returns.order-not-found')`.
- **`@kernel/permissions`** — Derives the caller's permission subject via `callerForSubject`.
- **`@kernel/ability`** — Checks the `returns.any.read` key with `holdsKey`.
- **`@modules/delivery`** (`delivery/index.ts`) — Sources `shippedQuantities` and `remainderOptions`.
- **`@modules/orders`** (`orders/index.ts`) — Reads the order document via `orderService.getById`; filters Art.-16-excluded items via `isExcludedFromWithdrawal`; types the document as `OrderDocument`.
- **`../domain`** (`returns/domain/index.ts`) — Supplies `returnableQuantities`, `wireLines`, `holdsReturnedGoods`, and the `ProductQuantity` type used to compute what is still returnable after subtracting in-flight returns.
- **`./cancellation-refund`** — Computes `refund.total` and `refund.shipping` for each cancellable fulfillment.
- **`./ownership`** — Resolves the caller's own order when the caller is not staff.

## Notes

- **Art. 16 exclusions:** Order items flagged by `isExcludedFromWithdrawal` are removed from the returnable set before quantities are computed — they are never offered as return options.
- **`returnable` vs `cancellable`:** `returnable` covers already-shipped units minus goods currently in a return; `cancellable` covers not-yet-fully-shipped fulfillment orders that still have a remainder. These are distinct concepts and should not be conflated.
- **Shipping refund on last unit:** `cancellationRefundOn` includes a delivery-refund component when cancelling the last unit of a fulfillment order; this is surfaced as the `shippingRefund` field per cancellation line.
- All three data fetches (`findByOrderId`, `shippedQuantities`, `remainderOptions`) run in parallel via `Promise.all` before any computation.
