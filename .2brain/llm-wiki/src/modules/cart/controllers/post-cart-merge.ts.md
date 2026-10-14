---
source: src/modules/cart/controllers/post-cart-merge.ts
sha256: 27bfe3b4535ea4eb2d72f45f4ad10732d0efd4fa4869845322ce4180b2797aaa
generated_at: 2026-10-14T15:07:47.008519+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/controllers/post-cart-merge.ts

## Purpose
Thin HTTP adapter for the `POST /cart/merge` endpoint. It validates the request body, delegates to `cartService.cartMerge`, and formats the response. Exists solely to bridge the Express route to the cart service without business logic.

## Key elements
- **`postCartMerge`** (exported) — Express handler that:
  1. Parses and validates the body against the `MergeCartBody` Zod schema via `parseBody`.
  2. Calls `cartService.cartMerge(authContext.id, body.lines, callerContext)` with the caller's identity and extracted context.
  3. Responds with `successResponse` on success or routes the error through `catchAs` on failure.

## Relationships
- **`src/modules/cart/services/index.ts`** — provides `cartService`; the `cartMerge` method contains all merge logic.
- **`src/infrastructure/http/controller.ts`** — supplies `parseBody` (schema validation + early-exit) and `catchAs` (error-to-response mapping).
- **`src/infrastructure/http/request.ts`** — supplies `callerContextOf` to derive caller metadata (e.g., client hints) from the Express request.
- **`src/infrastructure/http/response.ts`** — supplies `successResponse` for the standard 200 envelope.
- **`src/modules/cart/routes.ts`** — registers `postCartMerge` as the handler for `POST /cart/merge`.
- **`src/types/index.ts`** — defines the `MergeCartRequest` and `MergeCartResponse` types used in the handler signature.

## Notes
- **Partial-success contract:** Once the body passes validation the response is always 200. Individual lines the cart cannot accept are reported inside the `lines` array of the response body rather than producing a non-2xx status.
- **Auth is assumed present:** `request.authContext!.id` uses a non-null assertion, so this controller must only be mounted behind middleware that guarantees `authContext` is set.
- **Body typing:** The generic parameter on `Request` is `MergeCartRequest` (from `@types`), while the actual Zod schema used at runtime is `MergeCartBody` (from `@api/schemas.zod`). Keep both in sync when changing the shape.
