---
source: scenarios/flows/actions.ts
sha256: 17aa020075645872ff291356b98d75874d19a2fe6c54a105362e333b7f1d06ea
generated_at: 2026-09-23T17:17:22.019094+00:00
model: ollama:qwen3.8:27b
---

# scenarios/flows/actions.ts

## Purpose

Provides one function per shop action (stock, cart, payment, order lifecycle, product) as thin HTTP wrappers over the real REST endpoints. They exist so that scenario flows exercise the full middleware stack — auth, caller context, rate limiters — producing correct audit entries, actor scopes, and domain events that a direct service call would not generate.

## Key elements

- **`Line`** (interface) — `{ productId, quantity }`, the shape both the cart API and these functions share.
- **`CARD`** (const) — the three fake-provider payment-method handles: `visa` (instant settle), `declined` (409, retryable), `challenge` (3-D Secure `requires_action`).
- **`receiveStock`** — `POST /inventory/receipts` to seed opening stock (catalogue starts at `onHand: 0`).
- **`checkout`** — fills the cart line-by-line via `POST /cart`, then `POST /cart/checkout`; returns the new order id.
- **`openPayment`** — `POST /payments/intent` to freeze an order's price; returns the payment id.
- **`submitCard`** — `POST /payments/{id}/confirm`; uses `.attempt()` to surface a 409 as the string `'declined'` rather than throwing, letting the caller decide acceptability.
- **`syncPayment`** — `POST /payments/{id}/sync`; settles a `requires_action` payment post-challenge.
- **`checkoutAndPay`** — convenience: `checkout` → `openPayment` → `submitCard(CARD.visa)` in one call.
- **`recordOfflinePayment`** — `POST /payments/order/{id}/offline` for admin-recorded non-provider payments.
- **`advanceOrder`** — `PUT /orders/{id}` for the one status move still allowed there (`processing`); `shipped`/`delivered` require the dedicated routes below.
- **`shipOrder`** — `POST /delivery/order/{id}/ship`; moves `processing → shipped`.
- **`deliverOrder`** — `POST /delivery/order/{id}/deliver`; moves `shipped → delivered`.
- **`cancelOrder`** — `POST /orders/{id}/cancel`; `refund` param is the operator's choice (customer-initiated cancels are always refunded server-side).
- **`softDeleteOrder`** — `DELETE /orders/{id}` (sets `deletedAt`, row persists).
- **`replaceProductImage`** — `PATCH /products/{id}` with `{ imageUrl }`; exercises the live-resolution contract.
- **`hardDeleteProduct`** — `DELETE /products/{id}/hard`; row is removed, order lines resolve `current: null`.

## Relationships

- **`scenarios/flows/client.ts`** — provides the `Caller` type imported here; every function in this file takes a `Caller` as its first argument and delegates the HTTP request to `.call()` / `.attempt()`.
- **`scenarios/flows/shop-history.ts`** — the primary consumer of these actions; the history scenarios compose these wrappers to walk an order through the full lifecycle.

## Notes

- Functions intentionally return only the minimal scalar the flow needs (an id or a status string), not the full response body. Callers should not expect extra fields.
- `submitCard` uses `Caller.attempt` (not `call`) specifically so a 409 is inspectable; all other functions use `call`, which throws on non-2xx.
- `advanceOrder` is deliberately restricted to statuses that `PUT /orders/{id}` permits. Attempting to jump to `shipped` or `delivered` through it will be refused by `canTransition` server-side.
- `checkout` adds cart lines sequentially (`await` each `POST /cart`) rather than batching, mirroring what a browser does.
- `replaceProductImage` uses a plain JSON `PATCH`, not the multipart upload route — the scenario only needs the value change, not a file decode.
