---
source: scenarios/flows/actions.ts
sha256: 2fff69e10b855ca02e07beb46e3cde4007f576dbcc49f9761f6e01f024ad5adc
generated_at: 2026-09-27T13:49:33.077937+00:00
model: ollama:qwen3.8:27b
---

# scenarios/flows/actions.ts

## Purpose

A set of thin HTTP-wrapper functions that simulate the discrete actions a person takes in the shop (stocking, buying, paying, shipping, cancelling, deleting). Each function hits the same endpoint a browser would, so the full middleware stack—authentication, actor scope, audit entries, domain events, rate limiters—runs for real. The file exists so scenario flows can compose realistic order histories without bypassing the request pipeline.

## Key elements

- **`Line`** (interface) — shape of a single cart/order line (`productId`, `quantity`).
- **`CARD`** (const) — the three fake payment-provider method handles: `visa` (settles), `declined` (409, retryable), `challenge` (3-D Secure, requires sync).
- **`receiveStock`** — `POST /inventory/receipts` to seed opening stock for a product.
- **`checkout`** — fills the cart line-by-line, sets the shipping method (default `'pickup'`), then `POST /cart/checkout`; returns the order id.
- **`openPayment`** — `POST /payments/intent`; returns the payment id.
- **`submitCard`** — `POST /payments/{id}/confirm` via `caller.attempt`; maps a 409 to the string `'declined'`, throws on any other non-200; otherwise returns the payment's `status` string.
- **`syncPayment`** — `POST /payments/{id}/sync`; returns the payment's `status`.
- **`checkoutAndPay`** — composite: `checkout` → `openPayment` → `submitCard(CARD.visa)`; returns the order id.
- **`recordOfflinePayment`** — `POST /payments/order/{id}/offline` for admin-entered cash/bank/other payments.
- **`startProcessing`** — `POST /orders/{id}/status-override` to move an order `paid → processing`.
- **`shipOrder`** — `POST /delivery/order/{id}/ship`; optional `trackingCode`.
- **`deliverOrder`** — `POST /delivery/order/{id}/deliver`.
- **`cancelOrder`** — `POST /orders/{id}/cancel`; optional `refund` flag (operator's choice; customer self-cancel always refunds).
- **`softDeleteOrder`** — `DELETE /orders/{id}` (sets `deletedAt`).
- **`replaceProductImage`** — `PATCH /products/{id}` with a new `imageUrl` string.
- **`hardDeleteProduct`** — `DELETE /products/{id}/hard` (row removed).

## Relationships

- **`scenarios/flows/client.ts`** — provides the `Caller` type imported here as the first parameter of every function. All HTTP verbs (`call`, `attempt`) and auth context flow through that interface.
- **`scenarios/flows/shop-history.ts`** — the consumer that composes these action functions into multi-step historical scenarios; the module docblock explicitly calls these "the verbs the shop's history is written in."

## Notes

- `submitCard` is the only function that uses `caller.attempt` instead of `caller.call`, because two of the three intended outcomes (409 decline, 3-D Secure) are non-2xx and must not throw.
- `startProcessing` deliberately uses the `status-override` endpoint rather than `PUT /orders/{id}`; the normal transition is `system`-scoped in `orders/domain/lifecycle.ts`, making the override the only reachable path for a non-system caller.
- `checkout` defaults the shipping method to `'pickup'` because not every seeded shopper has an address; flows that need a real shipment must pass `shippingMethodId: 'standard'` explicitly.
- `cancelOrder`'s `refund` parameter is optional and only meaningful for operator-initiated cancels; a customer cancelling their own paid order is always refunded regardless of this value.
- `replaceProductImage` uses a plain JSON `PATCH` (not multipart) because the contract accepts `imageUrl` as a string; the intent is to exercise the "order resolves the live image" path, not file handling.
