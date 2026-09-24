---
source: src/modules/cart/controllers/post-cart.ts
sha256: cdc3bee68c60000cadd5e4b9300e941626fd4f84afce6a8c72ce0eb14cd83f79
generated_at: 2026-09-23T18:29:29.797730+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/controllers/post-cart.ts

## Purpose

Thin HTTP adapter that handles `POST /cart`. It validates the incoming request body, extracts the caller identity, and delegates the actual "add-or-replace cart line" logic to `cartService.cartItemAdd`. The controller itself contains no business rules; eligibility checks live in the service layer so they stay consistent across `PUT /cart/{productId}` and the wishlist's move-to-cart path.

## Key elements

- **`postCart`** (exported function) — The sole handler. Steps: read `request.authContext!.id` → `parseBody` with the Zod schema `UpsertCartItemBody` → `requireObjectId` on `productId` → call `cartService.cartItemAdd(userId, productId, quantity, callerContextOf(request))` → on success send `successResponse` with a `200` and i18n message `cart.product-added`; on refusal call `refused`; on unexpected error call `catchAs(response, 'upsertCartItem')`.

## Relationships

- **`src/modules/cart/routes.ts`** — Registers `postCart` as the handler for the `POST /cart` route; this file is a leaf in that wiring.
- **`src/modules/cart/services/index.ts`** — Exports `cartService`; `postCart` calls `cartService.cartItemAdd` and consumes its typed result.
- **`src/infrastructure/http/controller.ts`** — Supplies the reusable helpers `parseBody`, `refused`, and `catchAs` that structure the request lifecycle in this handler.
- **`src/infrastructure/http/request.ts`** — Supplies `requireObjectId` (format guard) and `callerContextOf` (builds the context object passed to the service).
- **`src/infrastructure/http/response.ts`** — Supplies `successResponse`, the canonical way this codebase emits a JSON success payload.
- **`src/infrastructure/i18n/index.ts`** (and `context.ts`) — Exports `t`, the translation function used for the success message string.
- **`src/types/index.ts`** — Defines `CartResponse` and `UpsertCartItemRequest` used in the generic type parameters of the handler signature.

## Notes

- The handler is **not** an async function; it returns a Promise chain (`cartService.cartItemAdd(...).then(...).catch(...)`). Callers (or Express) must not `await` it as a synchronous function.
- `request.authContext!` is asserted non-null with `!`. The auth middleware is expected to run before this handler; if it does not, the `!` will throw at runtime rather than produce a typed error.
- `productId` is validated against the Zod schema _and_ separately against Mongo `ObjectId` format via `requireObjectId`. The Zod schema types it as a plain string (matching the OpenAPI contract), so the ObjectId check is a second, narrower guard.
- The success status is `200`, not `201` or `202`. The endpoint is an upsert (add _or_ replace quantity), so a creation-style status would be misleading.
