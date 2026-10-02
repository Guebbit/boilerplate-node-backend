---
source: scenarios/flows/actions.ts
sha256: 16b06640e415352b6c7a2bcb69c7091911537eea660250ea025e3b2492b60640
generated_at: 2026-10-01T12:20:51.208359+00:00
model: ollama:qwen3.8:27b
---

# scenarios/flows/actions.ts

## Purpose

Thin HTTP wrappers for every action a person takes in a shop-history scenario. Each function hits the same endpoint a browser would call so that audit entries, actor scope, and domain events are produced through the real middleware stack (authentication, caller context, rate limiters). A direct service call would create the order but none of its trail.

## Key elements

- **`Line`** — `{ productId, quantity }`, the shape both the cart and callers use.
- **`CARD`** — three fake-provider method refs (`visa` settles, `declined` → 409, `challenge` → `requires_action`).
- **`receiveStock(owner, productId, quantity)`** — `POST /inventory/receipts` to seed opening stock.
- **`checkout(caller, lines, options?)`** — fills the cart line-by-line, sets shipping method (defaults to `pickup`), then `POST /cart/checkout`; returns the new order id.
- **`openPayment(caller, orderId)`** — `POST /payments/intent`; returns payment id.
- **`submitCard(caller, paymentId, ref)`** — `POST /payments/:id/confirm` via `attempt()`; normalises 409 to the string `'declined'`, passes through other statuses, throws on anything else.
- **`syncPayment(caller, paymentId)`** — `POST /payments/:id/sync`; resolves a `requires_action` (3-D Secure) payment.
- **`checkoutAndPay(caller, lines)`** — convenience: checkout + `CARD.visa` in one call.
- **`recordOfflinePayment(owner, orderId, method)`** — admin records cash/bank/other.
- **`startProcessing` / `shipOrder` / `deliverOrder`** — move an order through `processing → shipped → delivered` via the delivery endpoints.
- **`cancelOrder(caller, orderId, refund?)`** — cancels; `refund` is the operator's choice (customer self-cancels always refund).
- **`softDeleteOrder(owner, orderId)`** — `DELETE /orders/:id` (sets `deletedAt`).
- **`replaceProductImage(owner, productId)`** — `PATCH /products/:id` with a 1×1 PNG via multipart; the only way to change `imageUrl`.
- **`hardDeleteProduct(owner, productId)`** — `DELETE /products/:id/hard`; row is gone, not hidden.

## Relationships

- **`scenarios/flows/client.ts`** — source of the `Caller` type that every function takes as its first argument. `Caller.call()` performs the request; `Caller.attempt()` (used only by `submitCard`) tolerates non-2xx outcomes without throwing.
- **`scenarios/flows/shop-history.ts`** — the consuming flow file; it calls these wrappers in sequence to build the order → payment → delivery history it then asserts against.

## Notes

- `submitCard` is the only function that uses `caller.attempt()` rather than `caller.call()`, because a 409 (declined) is a *valid* outcome two of the three payment rows expect, not an error.
- `checkout` defaults `shippingMethodId` to `'pickup'` because not every seeded shopper has a delivery address; flows needing real shipment pass `'standard'`.
- `TINY_PNG` is a genuine 1×1 PNG (base64-decoded) because the server digests every upload and rejects undecodable bytes.
- `hardDeleteProduct` removes the row entirely (order lines resolve `current: null` afterwards), in contrast to `softDeleteOrder` which only stamps `deletedAt`.
- All functions are fire-and-forget with respect to side effects they do *not* check (e.g. `startProcessing` does not verify the order actually transitioned); assertions live in the calling flow.
