---
source: scenarios/flows/actions.ts
source_sha256: 66c6e081e1b1c4482f4dfb71bc4ba2d1ce70c728ef919e8cc6db92a89cbf0603
context_sha256: c2bcf42be90cd3263e979ff0202fe17e2053d3c0bb3d0f9c015217049e422a55
generated_at: 2026-11-22T01:42:50.661185+00:00
model: claude-code:claude-sonnet-5-5
---

# scenarios/flows/actions.ts

## Purpose
Defines the "verbs" that the shop's scenario history is written in: one function per user or operator action (stock, checkout, pay, ship, hold, and so on). Each is a thin wrapper over the HTTP endpoint a browser would call. They go through the real request path instead of calling a service. This is the only way the audit entries, actor scope and domain events come out right, because the middleware stack (authentication, caller context, rate limiters) has to run.

## Key elements
- `Line`: exported `{ productId, quantity }` order-line type.
- `CARD`: the fake payment provider's method handles. `visa` settles immediately, `declined` returns a retryable 409, and `challenge` requires 3-D Secure and then `/sync`.
- `receiveStock(owner, productId, quantity)`: posts opening stock to `/inventory/levels/:id/receive`. The catalogue seeds with no stock.
- `checkout(caller, lines, options)`: the customer half of an order. It does the following in order:
  - Ensures the shopper has an address (private `ensureAddress`).
  - Adds each line to the cart.
  - Sets the shipping method (default `pickup`).
  - Reads the cart total.
  - Posts `/cart/checkout` with `expectedTotal`.
  - Returns the order id.
- `openPayment(caller, orderId)`: creates a payment intent and returns its id.
- `submitCard(caller, paymentId, paymentMethodRef)`: confirms the payment and returns its status. A 409 returns `'declined'`, and any other non-200 response throws.
- `syncPayment(caller, paymentId)`: settles a `requires_action` payment after the 3-D Secure challenge and returns its status.
- `checkoutAndPay(caller, lines, options)`: `checkout`, then `openPayment`, then `submitCard` with `CARD.visa`. Returns the order id.
- `recordOfflinePayment(owner, orderId, method)`: the admin records cash, bank transfer or other money.
- `startProcessing(owner, orderId)`: moves a paid order to `processing` via `/orders/:id/process`.
- `shipOrder(owner, orderId)`: ships every open physical fulfillment order in full, one shipment each.
- `shipPart(owner, orderId, productId, quantity)`: ships part of one line, leaving the order `partially_fulfilled`.
- `holdOrder(owner, orderId, reason)`: puts the order's first fulfillment order on hold.
- `deliverOrder(owner, orderId)`: records shipment arrival, moving the order from `shipped` to `delivered`. The visible content cuts off before its body.
- Private helpers: `readFulfillment` (GETs fulfillment orders and shipments) and `inSequence` (runs async steps strictly one after another).

## Relationships
- `client.ts`: supplies the `Caller` type, which is imported as a type only. Every function takes a `Caller` and issues its HTTP requests through it. `submitCard` uses the variant that returns status and data instead of throwing, so it can treat a 409 as a decline.
- `shop-history.ts`: not shown in this file's content. Doc comments say the history rows call these verbs, and that two of the three payment rows deliberately want a decline or a 3-D Secure outcome.

## Notes
- Permission requirements are documented per function, for example `inventory.any.create`, `payments.any.create`, `delivery.any.start` and `delivery.any.update`. The `owner` parameter must be a caller holding them.
- `submitCard` returns the outcome instead of asserting success, so callers decide whether a decline or challenge is acceptable.
- `inSequence` exists because the app's per-order transaction does not accept concurrent calls, so fulfillment steps run serially.
- `shipPart` and `holdOrder` act on the first fulfillment order only (`fulfillmentOrders[0]`), with no emptiness check.
- `shipOrder` sends no tracking code, since the scenario's shipping methods are not `tracked`.
- `startProcessing` is used instead of a status override so seeded orders carry ordinary history, not status-correction audit rows.
- The cart's shipping method is set with `PUT /cart/shipping-method`, not in the checkout body.
- `checkout` defaults to `pickup` because demo products are physical and `pickup` needs no shipping address. Billing still needs an address.
