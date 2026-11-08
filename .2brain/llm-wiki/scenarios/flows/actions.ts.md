---
source: scenarios/flows/actions.ts
sha256: cae5d85ddd2cb704a390c163afb4b9e1b2b1171e8588078cb9992b7d584e259d
generated_at: 2026-11-08T02:28:44.211075+00:00
model: ollama:qwen3.8:27b
---

# scenarios/flows/actions.ts

## Purpose
Thin HTTP wrappers — one function per action a person takes in the shop (stock, cart, checkout, payment, fulfillment). Each calls the same endpoint a browser would, through the full middleware stack, so the resulting rows carry the audit entry, actor scope, and domain event that a direct service call would omit.

## Key elements
- **`Line`** — interface for a cart/order line (`productId`, `quantity`).
- **`CARD`** — const object with the fake provider's method handles: `visa` (settles), `declined` (409), `challenge` (3-D Secure).
- **`receiveStock`** — posts opening stock to `/inventory/levels/{id}/receive`.
- **`checkout`** — ensures an address, adds lines to the cart, sets shipping method (default `pickup`), reads the cart summary, and POSTs `/cart/checkout`. Returns the new order id.
- **`openPayment`** — POSTs `/payments` with an `orderId`; returns the payment id.
- **`submitCard`** — POSTs `/payments/{id}/confirm` via `.attempt()` (not `.call()`) so a 409 is caught and normalized to the string `'declined'`; any other non-200 throws. Returns the payment status string.
- **`syncPayment`** — POSTs `/payments/{id}/sync` after a 3-D Secure challenge; returns the final status.
- **`checkoutAndPay`** — composes `checkout` + `openPayment` + `submitCard(CARD.visa)` in one call.
- **`recordOfflinePayment`** — POSTs a non-provider payment (cash, bank transfer) to `/orders/{id}/payments`.
- **`startProcessing`** — POSTs `/orders/{id}/process` to move the order into `processing`.
- **`shipOrder`** — reads fulfillment data, then ships every open `physical` fulfillment order in sequence.
- **`shipPart`** — ships a single line (given `productId` + `quantity`) from the first fulfillment order.
- **`holdOrder`** — puts the first fulfillment order on hold with a reason.
- **`deliverOrder`** — records arrival for every shipment with status `shipped`, in sequence.
- *(truncated)* — likely a cancel/withdraw function for unshipped remainder.

## Relationships
- **`scenarios/flows/client.ts`** — source of the `Caller` type; every function in this file takes a `Caller` and delegates HTTP (`.call` / `.attempt`) to it.
- **`scenarios/flows/shop-history.ts`** — the primary consumer: composes these actions into narrative scenarios (a buyer's purchase, an operator's fulfillment, etc.).

## Notes
- **Why HTTP, not a service call:** the module docblock is explicit — audit entries, actor scope, and domain events only materialise when the request traverses the real middleware (auth, caller context, rate limiters). A service call would create the order row but none of its trail.
- **`submitCard` uses `.attempt()`**, not `.call()`, specifically so the 409 "PAYMENT_DECLINED" response is handled as a normal return value rather than an exception. Two of the three card paths *want* a non-final outcome.
- **`checkout` defaults shipping to `pickup`** so no shipping address is required; a flow that demonstrates real shipment overrides `shippingMethodId`.
- **`inSequence`** (private helper) serialises per-fulfillment-order calls because the app's per-order transaction rejects concurrent writes.
- **`ensureAddress`** is intentionally private: it is a precondition baked into `checkout`, not an action a flow would call on its own.
- **`readFulfillment`** (private) reads fulfillment-orders first — that GET is what creates the fulfillment orders for a paid order that has none yet — then reads shipments.
- `CARD` values mirror those declared in `scenarios/support/doubles/payments/fake.ts`.
