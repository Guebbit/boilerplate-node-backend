---
source: src/modules/cart/controllers/post-cart-merge.ts
sha256: e22031bba359cc9cf8b6e5b2a949b12df3766fe9ec87a3b01cbe006a9d46f582
generated_at: 2026-10-29T03:20:36.105366+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/controllers/post-cart-merge.ts

## Purpose
Thin Express controller for `POST /cart/merge`. Validates the incoming body, delegates to `cartService.merge`, and shapes the HTTP response. Exists solely as the HTTP-adapter layer between the Express route and the cart service, keeping transport concerns (body parsing, response formatting, error mapping) out of the service.

## Key elements
- **`postCartMerge(request, response)`** — the sole export. Steps:
  1. Validates `request.body` against the `MergeCartBody` Zod schema via `parseBody`; aborts (4xx) if invalid.
  2. Calls `cartService.merge(authId, lines, callerContext)` and returns the resulting Promise.
  3. On resolve → `successResponse<MergeCartResponse>` writes a 200 with the merge result.
  4. On reject → `catchAs(response, 'mergeCart')` maps the error to an HTTP response.

## Relationships
- **`src/modules/cart/routes.ts`** — registers `postCartMerge` as the handler for the `POST /cart/merge` route.
- **`src/modules/cart/services/index.ts`** — source of `cartService`; its `.merge` method performs the actual line-folding logic.
- **`src/infrastructure/http/controller.ts`** — provides `parseBody` (Zod validation + 4xx short-circuit) and `catchAs` (error → response mapping).
- **`src/infrastructure/http/request.ts`** — provides `callerContextOf`, which extracts caller metadata from the request for the service call.
- **`src/infrastructure/http/response.ts`** — provides `successResponse` for the standard 200 envelope.
- **`src/types/index.ts`** — defines `MergeCartRequest` and `MergeCartResponse` used for typed Express parameters and the response payload.

## Notes
- **Partial-success by design.** Once the body is valid the route always returns 200. Lines the cart cannot accept are reported inside the response body (`lines` array) rather than surfaced as an HTTP error, so accepted lines still land.
- **Non-null assertion on `request.authContext!`** — the controller assumes an upstream auth middleware has already attached the context; there is no guard here.
- **Not declared `async`.** The function returns the Promise chain directly (`.then().catch()`) instead of using `async/await`; callers should treat it as returning `Promise<void>`.
