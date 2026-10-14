---
source: src/modules/cart/controllers/post-checkout.ts
sha256: b6768cb112e305e0481505a05bd795beff9c1ec5d264f0ed4532f9edef0e9217
generated_at: 2026-10-14T15:08:25.319355+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/controllers/post-checkout.ts

## Purpose

HTTP controller for `POST /cart/checkout`. It validates the request body, delegates to `cartService.orderConfirm`, records the `cart_checkout_total` metric on every outcome, transforms the resulting order through `orderService.withActions` into its wire shape, and returns a `201` with the created order. Exists to keep the HTTP/response concerns out of the cart service layer.

## Key elements

- **`postCheckout(request, response)`** — The single exported handler. Parses the body against the `CheckoutBody` Zod schema, calls `cartService.orderConfirm(userId, callerContext, body)`, and either responds `201` (with the order serialized via `orderService.withActions`) or delegates the failure to `catchAs`.

- **Metric recording** — `cartCheckoutTotal.inc({ status })` fires in three places: the success branch, the `refused()` branch (implicit — the metric line precedes the `refused` guard), and the `.catch` branch. A checkout that throws is still counted as a `failure` observation.

- **`orderService.withActions(result.data, request.authContext)`** — Converts the `OrderDocument` into the response wire shape, resolving each line item's live `current` picture. A plain `.toJSON()` would omit that field.

- **`createdResponse<Order>(…)`** — Sends `201`, the serialized order body, a `Location` header of `/orders/:id`, and the i18n `orders.creation-success` string as the envelope message.

## Relationships

- **`src/modules/cart/services/index.ts`** — Provides `cartService.orderConfirm`, the core business call.
- **`src/modules/cart/metrics.ts`** — Provides the `cartCheckoutTotal` Prometheus counter incremented on every outcome.
- **`src/modules/orders/index.ts`** — Provides `orderService.withActions`, which shapes the order for the HTTP response.
- **`src/infrastructure/http/controller.ts`** — Provides `parseBody`, `refused`, and `catchAs` (the shared validation/error-refusal helpers).
- **`src/infrastructure/http/request.ts`** — Provides `callerContextOf` to extract the authenticated user's context for the service call.
- **`src/infrastructure/http/response.ts`** — Provides `createdResponse` (the 201 envelope helper).
- **`src/infrastructure/i18n/index.ts`** — Provides the `t()` translator used for the success message.
- **`src/types/index.ts`** — Supplies the `Order` type used as the generic parameter on `createdResponse`.
- **`src/modules/cart/routes.ts`** — Imports `postCheckout` to register it on the `POST /cart/checkout` route.

## Notes

- The metric increment happens **before** the `refused()` guard in the success path, so a business-level refusal (e.g., cart total mismatch) is recorded as `failure`, not skipped. The `.catch` handler also increments `failure` independently — a thrown error is a second failure path.
- `request.authContext!.id` uses a non-null assertion; the route is assumed to be behind an auth middleware that always populates `authContext`.
- The body is intentionally required: omitting it causes `parseBody` to receive `undefined`, which fails the `CheckoutBody` schema and returns `422` — same treatment as any malformed body.
- The i18n key `orders.creation-success` lives in the *orders* namespace, not the *cart* namespace, because the response describes the created order resource.
