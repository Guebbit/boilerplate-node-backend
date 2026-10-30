---
source: src/modules/cart/controllers/post-cart-items.ts
sha256: 3e5067991cc4dbc26e062e5ce713fba7ad8fe8814b3a06795f22f9b9cbb1eedb
generated_at: 2026-10-29T03:20:25.896176+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/controllers/post-cart-items.ts

## Purpose

Thin HTTP adapter for `POST /cart/items`. It parses and validates the request body, extracts the authenticated user, delegates to `cartService.addItem`, and serializes the full cart back as a `200` response. All business logic (eligibility, line creation vs. quantity increment) lives in the service layer.

## Key elements

- **`postCartItems`** (exported) – Express handler typed as `(Request<unknown, unknown, AddCartItemRequest>, Response) => void`. Steps: read `userId` from `request.authContext`, validate the body via `parseBody(AddCartItemBody, …)`, call `cartService.addItem(userId, productId, quantity, callerContextOf(request))`, then either short-circuit via `refused` or send `successResponse<CartResponse>(…, 200)`. Catches unexpected errors with `catchAs(response, 'addCartItem')`.

## Relationships

- **`src/infrastructure/http/controller.ts`** – Supplies the `parseBody`, `refused`, and `catchAs` helpers that structure the controller's validate → call → respond flow.
- **`src/infrastructure/http/request.ts`** – Provides `callerContextOf`, which extracts caller metadata forwarded to the service for audit/tracing.
- **`src/infrastructure/http/response.ts`** – Provides `successResponse` for the uniform `200` + `CartResponse` envelope.
- **`src/modules/cart/routes.ts`** – Registers `postCartItems` on the `POST /cart/items` route (the sole consumer of this export).
- **`src/modules/cart/services/index.ts`** – Exports `cartService`; its `addItem` method performs the actual cart mutation and eligibility checks.
- **`src/types/index.ts`** – Defines `CartResponse` (the response payload) and `AddCartItemRequest` (the typed request body) used in the handler's generic parameters.

## Notes

- **No per-line URL:** the response is always the *entire* cart (200), because a cart line is written through its parent and has no standalone resource URL. `PATCH /cart/items/{productId}` is the endpoint for explicit set.
- **Eligibility is service-owned:** whether a product *may* be in a cart is decided inside `cartService.addItem`, not here. The same rule must hold for the PATCH route and the wishlist's move-to-cart, so changing eligibility logic means touching the service, not the controller.
- **`productId` pre-validation:** `parseBody` already rejects a `productId` that doesn't belong to this backend (returns 422), so the controller trusts the parsed `productId` without a second check.
- **Non-optional auth:** `request.authContext!.id` uses a non-null assertion, implying upstream middleware guarantees an authenticated context before this handler runs.
