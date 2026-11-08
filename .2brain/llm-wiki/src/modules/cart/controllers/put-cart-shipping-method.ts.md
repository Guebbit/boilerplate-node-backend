---
source: src/modules/cart/controllers/put-cart-shipping-method.ts
sha256: 980e1c1660bb62cc3c552d9a1e59fc0be0fbb34c764cfb52055f4819d1b7efe3
generated_at: 2026-11-08T05:12:44.870580+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/controllers/put-cart-shipping-method.ts

## Purpose

Thin HTTP adapter for the `PUT /cart/shipping-method` endpoint. It parses and validates the incoming request body, delegates the actual work to `cartService.setShippingMethod`, and formats the result into a standard success or error response. Exists to keep route registration and business logic separated from Express plumbing.

## Key elements

- **`putCartShippingMethod(request, response)`** — The sole export. Reads `userId` from `request.authContext`, parses the body against the `SetCartShippingMethodBody` Zod schema, calls `cartService.setShippingMethod(userId, body.shippingMethodId)`, then either sends a `successResponse` (with the updated `CartResponse`) or short-circuits via `refused` / `catchAs`.

## Relationships

- **`src/modules/cart/routes.ts`** — Registers `putCartShippingMethod` as the handler for the `PUT /cart/shipping-method` route.
- **`src/modules/cart/services/index.ts`** — Supplies `cartService.setShippingMethod`, which performs the actual cart mutation and repricing.
- **`src/infrastructure/http/controller.ts`** — Provides the `parseBody`, `refused`, and `catchAs` helpers used for validation, domain-refusal mapping, and error serialization.
- **`src/infrastructure/http/response.ts`** — Provides `successResponse`, the canonical way to emit a 200 with a typed payload.
- **`src/types/index.ts`** — Defines `CartResponse` (the shape returned on success) and `SetCartShippingMethodRequest` (the typed body for the Express generic).

## Notes

- The shipping method can be set *or cleared*: the body carries a `shippingMethodId` that may be `null`, meaning "no shipping method."
- `request.authContext!` uses a non-null assertion; the route is expected to sit behind an auth middleware that guarantees the context exists.
- The controller is a fire-and-forget Promise chain (no `await`), consistent with the rest of the cart controllers in this project.
