---
source: src/modules/cart/controllers/put-cart-shipping-method.ts
sha256: 5ef6a89491a0af93e5b24dbb2efcdbc16d6c87c9672661b21b0401cb799b65a2
generated_at: 2026-11-14T19:28:15.211645+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/controllers/put-cart-shipping-method.ts

## Purpose

Thin HTTP adapter for `PUT /cart/shipping-method`. Validates the incoming body, delegates to `cartService.setShippingMethod`, and serialises the updated (re-priced) cart back to the client. Exists so the Express route layer stays a single-line registration.

## Key elements

- **`putCartShippingMethod`** (exported) — Express handler. Extracts `userId` from `request.authContext`, Zod-validates the body via `parseBody(SetCartShippingMethodBody, …)`, calls `cartService.setShippingMethod(userId, body.shippingMethodId)`, then either responds `200` with `CartResponse` (via `successResponse`) or propagates a refusal/error (`refused`, `catchAs`). A `null` `shippingMethodId` in the body clears the current method.

## Relationships

- **`src/infrastructure/http/controller.ts`** — supplies the three helpers used here: `parseBody` (Zod validation + early-return), `refused` (checks a domain `Refused` result and short-circuits the response), and `catchAs` (maps thrown errors to an error response).
- **`src/infrastructure/http/response.ts`** — provides `successResponse`, the standard 200 JSON envelope writer.
- **`src/modules/cart/routes.ts`** — registers this handler on the `PUT /cart/shipping-method` route.
- **`src/modules/cart/services/index.ts`** — exports the `cartService` singleton whose `setShippingMethod` method contains the actual business logic.
- **`src/types/index.ts`** — source of the `CartResponse` and `SetCartShippingMethodRequest` type aliases used in the handler signature and response payload.

## Notes

- **No `If-Match` / optimistic concurrency handling.** The comment states this intentionally: there is no `GET` on this URL to fetch an ETag, and the cart enforces its own line-item rules server-side.
- **Non-null assertion on `request.authContext!`** — assumes an upstream auth middleware has already populated it; the handler does not guard against a missing auth context.
- **Zod schema lives in `@api/schemas.zod`**, not in the cart module; the controller imports it from the API-schema package.
