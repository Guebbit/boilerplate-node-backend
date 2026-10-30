---
source: src/modules/cart/controllers/put-cart-shipping-method.ts
sha256: 980e1c1660bb62cc3c552d9a1e59fc0be0fbb34c764cfb52055f4819d1b7efe3
generated_at: 2026-10-29T03:21:05.256007+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/controllers/put-cart-shipping-method.ts

## Purpose

Thin HTTP adapter for the `PUT /cart/shipping-method` endpoint. Validates the incoming body, delegates to `cartService.setShippingMethod`, and formats the result into a standard success or refusal response. It exists to keep Express-specific concerns (parsing, status codes, auth extraction) out of the service layer.

## Key elements

- **`putCartShippingMethod`** (exported) — The request handler. Reads `userId` from `request.authContext!.id`, validates the body against `SetCartShippingMethodBody` (Zod schema), calls `cartService.setShippingMethod(userId, body.shippingMethodId)`, and returns either the updated `CartResponse` or a refusal.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Supplies the `parseBody`, `refused`, and `catchAs` helpers that this handler composes for validation, error short-circuiting, and error formatting.
- **`src/infrastructure/http/response.ts`** — Supplies `successResponse`, which wraps the service result into the project's standard success envelope.
- **`src/modules/cart/services/index.ts`** — Source of `cartService`; the actual `setShippingMethod` logic lives there.
- **`src/modules/cart/routes.ts`** — Registers `putCartShippingMethod` on the `PUT /cart/shipping-method` route.
- **`src/types/index.ts`** — Provides the `CartResponse` and `SetCartShippingMethodRequest` type contracts used in the handler signature and response.

## Notes

- `request.authContext!` uses a non-null assertion; the endpoint assumes an upstream auth middleware has already populated it. No guard is present in this file.
- `body.shippingMethodId` may be `null` to **clear** the selected shipping method (per the module doc comment), so the service must handle both set and clear in one code path.
- The handler uses `.then().catch()` chaining rather than `async/await`, matching the pattern in the `@infrastructure/http/controller` helpers.
