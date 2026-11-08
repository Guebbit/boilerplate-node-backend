---
source: src/modules/cart/controllers/post-checkout.ts
sha256: 04e6f58aa85a9f277286d9e4250b63953651fe1464452e77b4ed088bdb065554
generated_at: 2026-11-08T05:12:28.809084+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/controllers/post-checkout.ts

## Purpose

Thin Express handler for `POST /cart/checkout`. Validates the request body, delegates to `cartService.orderConfirm`, records the `cart_checkout_total` metric on every outcome, and responds with the newly created order. Exists to keep the cart route surface free of business logic and to isolate the metric-recording contract in one place.

## Key elements

- **`postCheckout(request, response)`** (exported) — The sole export. Express handler that:
  1. Extracts `userId` from `request.authContext`.
  2. Validates the body against `CheckoutBody` (Zod) via `parseBody`; a missing/malformed body short-circuits with 422.
  3. Calls `cartService.orderConfirm(userId, callerContextOf(request), body)`.
  4. Increments `cart_checkout_total` with `status: 'success' | 'failure'` on the `.then` path.
  5. On success, calls `orderService.withActions(result.data, …)` to obtain the full wire shape (including resolved line-item `current` snapshots), then replies `201` via `createdResponse` with `Location: /orders/:id`.
  6. On rejection (`.catch`), increments the metric with `status: 'failure'` and delegates to `catchAs(response, 'postCheckout')`.

## Relationships

- **`src/modules/cart/services/index.ts`** — Provides `cartService.orderConfirm`, the core business call.
- **`src/modules/orders/index.ts`** — Provides `orderService.withActions`, which shapes the `OrderDocument` into the response wire format and resolves live line-item data.
- **`src/modules/cart/metrics.ts`** — Source of the `cartCheckoutTotal` counter (Prometheus-style).
- **`src/infrastructure/http/controller.ts`** — Supplies `parseBody`, `refused`, and `catchAs` (shared HTTP helper utilities).
- **`src/infrastructure/http/request.ts`** — Supplies `callerContextOf`, which extracts a caller context object for downstream service calls.
- **`src/infrastructure/http/response.ts`** — Supplies `createdResponse`, which sets the 201 status, serialises the body, and writes the `Location` header.
- **`src/types/index.ts`** — Source of the `Order` type used as the generic on `createdResponse`.
- **`src/modules/cart/routes.ts`** — The router that mounts this handler at `POST /checkout` (this file is the handler it references).

## Notes

- **Metric is incremented on *every* outcome**, including thrown errors. The code intentionally calls `cartCheckoutTotal.inc` in both the `.then` (before `refused`) and the `.catch` blocks. A failed checkout is still a business-relevant event.
- **`orderService.withActions` is not optional sugar.** It is the step that resolves each line item's live `current` picture. A plain `.toJSON()` on the raw `OrderDocument` would omit that data from the response entirely.
- **The response is 201, not 200.** The checkout *creates* an order; the `Location` header points to `/orders/:id`, mirroring the `POST /orders` contract.
- **`request.authContext!`** uses a non-null assertion — the file assumes an auth middleware has already populated it. There is no guard in this function.
- The handler uses a `.then()/.catch()` chain rather than `async/await`; this is a deliberate style choice consistent with the `@infrastructure/http/controller` helpers.
