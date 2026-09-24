---
source: src/modules/cart/controllers/get-cart.ts
sha256: 7cc36058c687c382472b6c34381859241481c69bdbfe1ff23585c3a5f96e3e19
generated_at: 2026-09-23T18:29:19.867104+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/controllers/get-cart.ts

## Purpose

Thin HTTP adapter that exposes the current user's cart over `GET /cart`. It exists solely to bridge the Express request/response cycle to `cartService.cartGetForView`, keeping business logic in the service layer.

## Key elements

- **`getCart(request, response)`** — The single exported controller. Reads the authenticated user ID from `request.authContext!.id`, extracts caller metadata via `callerContextOf`, delegates to `cartService.cartGetForView`, and returns the result through `successResponse<CartResponse>`. Errors are funnelled to `catchAs(response, 'getCart')`.

## Relationships

- **`src/modules/cart/services/index.ts`** — Consumes `cartService.cartGetForView`; the only business call made in this file.
- **`src/infrastructure/http/response.ts`** — Uses `successResponse` to serialize the `CartResponse` payload back to the client.
- **`src/infrastructure/http/controller.ts`** — Uses `catchAs` as the unified error-forwarding handler.
- **`src/infrastructure/http/request.ts`** — Uses `callerContextOf` to derive request context (e.g. IP, user-agent) passed into the service.
- **`src/modules/cart/routes.ts`** — Registers `getCart` as the handler for the `GET /cart` route.
- **`src/types/index.ts`** — Imports the `CartResponse` type used to type the success payload.

## Notes

- Authentication is **not** performed here; the doc comment and the non-null assertion (`request.authContext!`) imply an upstream middleware guarantees a logged-in user.
- The controller is intentionally a one-liner wrapper — all domain logic lives in `cartService`. Avoid adding branching or mapping logic in this file.
