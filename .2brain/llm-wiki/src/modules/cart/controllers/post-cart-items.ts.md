---
source: src/modules/cart/controllers/post-cart-items.ts
sha256: 3e5067991cc4dbc26e062e5ce713fba7ad8fe8814b3a06795f22f9b9cbb1eedb
generated_at: 2026-11-08T05:12:02.702072+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/controllers/post-cart-items.ts

## Purpose

Thin HTTP adapter for `POST /cart/items` ("Add to cart"). Validates the request body, delegates to `cartService.addItem`, and serialises the result. It contains no business logic — eligibility rules live in the service layer so they stay consistent with `PATCH` and wishlist move-to-cart.

## Key elements

- **`postCartItems`** (exported function) — The sole export. Signature is `(Request<unknown, unknown, AddCartItemRequest>, Response) => void`. Flow:
  1. Extracts `userId` from `request.authContext.id`.
  2. Validates `request.body` against the `AddCartItemBody` Zod schema via `parseBody`; short-circuits with 422 on failure.
  3. Calls `cartService.addItem(userId, productId, quantity, callerContextOf(request))`.
  4. On success responds **200** with the full `CartResponse`; on domain refusal uses `refused`; on unexpected error delegates to `catchAs('addCartItem')`.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Supplies `parseBody`, `refused`, and `catchAs` (the three helper functions used for validation, domain-refusal, and error serialisation).
- **`src/infrastructure/http/request.ts`** — Supplies `callerContextOf`, which derives a request-scoped context object passed into the service call.
- **`src/infrastructure/http/response.ts`** — Supplies `successResponse` for the 200 JSON envelope.
- **`src/modules/cart/services/index.ts`** — Supplies the `cartService` instance whose `addItem` method performs the actual add/update-of-line logic.
- **`src/modules/cart/routes.ts`** — Upstream caller; wires `postCartItems` to the `POST /cart/items` route (the controller's entry point).
- **`src/types/index.ts`** — Provides the `CartResponse` and `AddCartItemRequest` types used in the generic signatures.

## Notes

- Returns **200**, not 201: a cart line has no independent URL (it is addressed through its parent cart), so the 200 + whole-cart body is the convention here.
- `parseBody` already rejects a `productId` that doesn't belong to this backend (422) before the service is ever called; the controller trusts that gate.
- The `request.authContext!` non-null assertion assumes the auth middleware has already populated it; this controller does not handle the unauthenticated case.
- Adding an existing product *increments* its line quantity (pressing the button twice yields two). Setting an explicit quantity is the job of `PATCH /cart/items/{productId}`, not this endpoint.
