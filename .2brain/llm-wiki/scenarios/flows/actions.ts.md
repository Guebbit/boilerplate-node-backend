---
source: scenarios/flows/actions.ts
sha256: d85d4082c21053049fa9e7d08f63af811684c2d2a0f9c730cf0d22c61216ca34
generated_at: 2026-11-14T17:15:03.027290+00:00
model: ollama:qwen3.8:27b
---

# scenarios/flows/actions.ts

## Purpose
Provides one function per "thing a person does" (check out, pay, ship, deliver, etc.), each a thin HTTP wrapper over the endpoint a browser would call. They deliberately go through the full middleware stack (auth, caller context, rate limiters) rather than invoking a service directly, because only that path emits the audit entry, actor scope, and domain event that a bare service call would skip.

## Key elements

- **`Line`** – interface for an order line (`productId`, `quantity`).
- **`CARD`** – const object of fake-provider payment-method handles (`visa`, `declined`, `challenge`) declared in `scenarios/support/doubles/payments/fake.ts`.
- **`receiveStock`** – posts opening stock to `/inventory/levels/{id}/receive`.
- **`ensureAddress`** *(private)* – if the caller has no addresses, creates one so checkout isn't refused.
- **`checkout`** – adds lines to cart, sets shipping method (defaults to `pickup`), reads the cart summary for `expectedTotal`, posts to `/cart/checkout`; returns the new order id.
- **`openPayment`** – posts to `/payments`; returns the payment id.
- **`submitCard`** – posts to `/payments/{id}/confirm` via `caller.attempt` (expects possible 409); returns the payment status string, mapping 409 → `'declined'`.
- **`syncPayment`** – posts to `/payments/{id}/sync` to settle a `requires_action` payment; returns status.
- **`checkoutAndPay`** – composes `checkout` + `openPayment` + `submitCard(CARD.visa)` in one call.
- **`recordOfflinePayment`** – posts a non-provider payment (cash, bank transfer, other) to `/orders/{id}/payments`.
- **`startProcessing`** – posts to `/orders/{id}/process`.
- **`readFulfillment`** *(private)* – fetches an order's fulfillment orders and shipments in two sequential GETs.
- **`inSequence`** *(private)* – awaits an async step over an array one at a time.
- **`shipOrder`** – creates a shipment for every open physical fulfillment order.
- **`shipPart`** – ships a partial quantity of one product from the first fulfillment order.
- **`holdOrder`** – posts a hold (with reason) to the first fulfillment order.
- **`deliverOrder`** – records delivery for every shipment in `shipped` status.

## Relationships

- **`scenarios/flows/client.ts`** – exports the `Caller` type (and its `call` / `attempt` methods) that every function in this file receives and invokes.
- **`scenarios/flows/shop-history.ts`** – the "history" this file's module docblock references; `shop-history.ts` composes these verbs into named narrative scenarios, so the audit trail they produce is the storyline that file asserts.

## Notes

- `submitCard` uses `caller.attempt` (not `call`) specifically because a 409 is a *valid* business outcome here (card declined); it maps that to the string `'declined'` instead of throwing, leaving the flow to decide whether to retry.
- `checkout` defaults the shipping method to `pickup` because it requires no address; a flow that needs real shipment passes `standard` (or another tracked method) explicitly.
- Sequential helpers (`inSequence`, the `for…await` in `checkout`) exist because the application's per-order transaction rejects concurrent mutations on the same order.
- `receiveStock` is needed because the catalogue now seeds every product at `onHand: 0`; without a prior receive call no product is purchasable.
