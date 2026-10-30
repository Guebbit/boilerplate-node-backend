---
source: scenarios/flows/actions.ts
sha256: e15947ad2ac9012be5bd37dfa67dff983dec19af2a4559d565d6692751c48bb1
generated_at: 2026-10-29T01:22:19.815464+00:00
model: ollama:qwen3.8:27b
---

# scenarios/flows/actions.ts

## Purpose

Provides the verb-level API for shop-history test scenarios. Each exported function is a thin wrapper over the HTTP endpoint a real browser would call (via `Caller`), ensuring that the full middleware stack—authentication, caller context, rate limiters, audit entries, and domain events—executes. This file is the "what a person does" layer; `shop-history.ts` composes these actions into narrative test flows.

## Key elements

- **`Line`** (interface) — `{ productId, quantity }`; the shape used by callers when passing cart lines.
- **`CARD`** (const) — Fake payment-provider method handles (`visa`, `declined`, `challenge`) declared in `scenarios/support/doubles/payments/fake.ts`.
- **`receiveStock`** — POSTs opening inventory for a product (catalogue seeds at `onHand: 0`).
- **`checkout`** — Fills the cart line-by-line, sets the shipping method (defaults to `pickup`), reads the cart summary for `expectedTotal`, then calls `POST /cart/checkout`. Ensures the caller has a billing address first.
- **`openPayment`** — Creates a payment intent for an order; returns the payment id.
- **`submitCard`** — Confirms a payment with a card ref. Uses `Caller.attempt` (not `call`) so a 409 decline is returned as `'declined'` rather than thrown; any other non-200 is an error.
- **`syncPayment`** — The post-challenge call (`POST /payments/{id}/sync`) that settles a `requires_action` payment.
- **`checkoutAndPay`** — Convenience: `checkout` + `openPayment` + `submitCard(CARD.visa)` in one call.
- **`recordOfflinePayment`** — Records a non-provider payment (`cash`, `bank_transfer`, `other`) against an order.
- **`startProcessing`** — Moves a paid order to `processing` via the warehouse endpoint (`POST /orders/{id}/process`).
- **`shipOrder`** — Ships every open physical fulfillment order in full (sequential POSTs), moving the order to `shipped`.
- **`shipPart`** — Ships a single line's worth from the first fulfillment order; order stays `processing` / `partially_fulfilled`.
- **`holdOrder`** — Places the first fulfillment order on hold with a reason.
- **`deliverOrder`** — Records arrival for every `shipped` shipment (sequential), completing delivery.
- **`cancelRemaining`** *(truncated in source)* — Cancels the unshipped remainder of the first fulfillment order as a buyer withdrawal.

Internal helpers: `ensureAddress`, `readFulfillment` (two sequential GETs for fulfillment orders + shipments), `inSequence` (serial executor to respect the app's per-order transaction constraint).

## Relationships

- **`scenarios/flows/client.ts`** — Source of the `Caller` type and its `call` / `attempt` methods. Every function in this file delegates HTTP transport to `Caller`; `Caller.email` is also read directly (used as the `fullName` fallback in `ensureAddress`).
- **`scenarios/flows/shop-history.ts`** — The consumer. It composes the exported actions into ordered scenario narratives (e.g. receive stock → checkout → open payment → submit card → ship → deliver) and asserts on the resulting audit/history rows.

## Notes

- **Why HTTP, not a service call:** The module docblock states explicitly that audit entries, actor scope, and domain events only materialise when the request traverses the real middleware stack. A direct service call would produce the order row but none of its trail.
- **`submitCard` returns a status string, not a boolean.** Two of the three test scenarios *expect* a non-final outcome (409 decline, `requires_action` challenge), so the caller decides what is acceptable.
- **`inSequence` exists because the app's per-order transaction rejects concurrent mutations.** All multi-item mutations (ship, deliver) are serialised through it.
- **Shipping method is set via `PUT /cart/shipping-method` before checkout**, not in the checkout body. Default is `pickup` (no address needed); flows demonstrating real shipment override to `standard`.
- **`ensureAddress` is idempotent:** it checks `GET /account/addresses` first and only POSTs if the list is empty.
- **`readFulfillment` makes two sequential GETs** (fulfillment-orders then shipments); the first GET also triggers creation of fulfillment orders for a paid order that has none yet.
