---
source: scenarios/flows/actions.ts
sha256: 61389e1e3dc3bbd6fba6c194fc8f79da40820ddc5e206a5454fb278c21d9c17e
generated_at: 2026-10-14T06:57:02.376643+00:00
model: ollama:qwen3.8:27b
---

# scenarios/flows/actions.ts

## Purpose

Thin HTTP wrappers over the shop's REST endpoints that scenario flows call to perform buyer and staff actions (stock intake, checkout, payment, fulfillment). Every call travels the real middleware stack—authentication, caller context, rate limiters—so each operation produces its full audit trail, actor scope, and domain events. They deliberately avoid direct `service` calls, which would create the resource but none of that trail.

## Key elements

- **`Line`** (interface) — `{ productId, quantity }`; the shared shape for a cart/order line.
- **`CARD`** (const) — Fake-provider payment-method handles: `visa` (settles), `declined` (409, retryable), `challenge` (3-D Secure / `requires_action`).
- **`receiveStock(owner, productId, quantity)`** — POSTs an inventory receipt to open a product's stock (catalogue seeds at `onHand: 0`).
- **`checkout(caller, lines, options?)`** — Ensures a billing address, adds lines to the cart one by one, sets the shipping method (`pickup` by default), reads the cart summary, and POSTs `/cart/checkout`. Returns the new order's id.
- **`openPayment(caller, orderId)`** — POSTs `/payments/intent`; returns the payment id.
- **`submitCard(caller, paymentId, paymentMethodRef)`** — Confirms the payment. Returns the status string; maps a 409 response to `'declined'` so callers can branch on it.
- **`syncPayment(caller, paymentId)`** — POSTs `/payments/{id}/sync` after a 3-D Secure challenge completes.
- **`checkoutAndPay(caller, lines, options?)`** — Composite: `checkout` → `openPayment` → `submitCard` with `CARD.visa`. Returns the order id.
- **`recordOfflinePayment(owner, orderId, method)`** — Admin-side: POSTs an offline payment (cash, bank transfer, etc.).
- **`startProcessing(owner, orderId)`** — POSTs `/delivery/order/{id}/start` to move an order into `processing`.
- **`shipOrder(owner, orderId, trackingCode?)`** — Ships every open physical fulfillment order in sequence.
- **`shipPart(owner, orderId, productId, quantity)`** — Ships a partial quantity from the first fulfillment order (order stays `processing`).
- **`holdOrder(owner, orderId, reason)`** — Puts the first fulfillment order on hold.
- **`deliverOrder(owner, orderId)`** — Marks all `shipped` shipments as delivered in sequence.
- **`cancelRemainder(caller, orderId)`** — Buyer-initiated cancellation of unshipped lines via `POST /returns`.
- **`ensureAddress`, `readFulfillment`, `inSequence`** (private) — Internal helpers: address bootstrap, fulfillment-state read, sequential-iteration guard.

## Relationships

- **`scenarios/flows/client.ts`** — Source of the `Caller` type used by every function in this file. All HTTP calls go through `caller.call()` or `caller.attempt()`.
- **`scenarios/flows/shop-history.ts`** — The consumer of these actions. Each function here is one "verb" in the shop's written history; `shop-history.ts` orchestrates them to build the narrative rows (audit entries, domain events) that the scenario asserts.

## Notes

- **Sequential by design.** `inSequence` exists because the app's per-order transaction rejects two concurrent writes; all multi-line / multi-shipment loops await each call before the next.
- **`submitCard` does not assert a status.** Two of the three `CARD` handles intentionally produce a non-final outcome (409 decline, `requires_action`). The caller decides what is acceptable; the function only normalises 409 → `'declined'` and throws on anything else non-200.
- **Shipping method is set before checkout, not in the checkout body.** `PUT /cart/shipping-method` is called separately, matching the current cart-checkout contract (`docs/modules/cart-checkout.md`).
- **`checkout` defaults to `pickup`.** Every demo product is physical and `pickup` requires no shipping address, so it is the zero-friction default. Flows that demonstrate a real shipment pass `shippingMethodId: 'standard'` via options.
- **`ensureAddress` is idempotent and best-effort.** It checks for existing addresses first and only creates one if the list is empty; it uses the caller's own email as the name.
- **`shipPart` always targets `fulfillmentOrders[0]`.** It does not search for a specific fulfillment order; flows that need a particular one should use `shipOrder` or read fulfillment directly.
