---
source: src/modules/returns/controllers/post-return-decision.ts
sha256: 52f17491a9d5039fabf91a44b4785c7795b7c8b9bee27192f88c448819e056ae
generated_at: 2026-10-29T05:36:31.467953+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/controllers/post-return-decision.ts

## Purpose

Express handlers for the two staff-facing return-decision actions (`POST /returns/:id/approve` and `POST /returns/:id/decline`). Each validates the request, delegates to `returnService`, and responds with the updated `Return` object (HTTP 200).

## Key elements

- **`postReturnApprove`** — Resolves the `:id` param, calls `returnService.approveReturn(id, callerContext)`, and returns the result wrapped in `successResponse`. No request body is read.
- **`postReturnDecline`** — Resolves the `:id` param, validates `request.body` against the `DeclineReturnBody` Zod schema via `parseBody`, calls `returnService.declineReturn(id, body, callerContext)`, and returns the result in `successResponse`.
- Both handlers use the shared `refused` guard to short-circuit with the service's error response if the operation was rejected, and `catchAs` for unhandled promise rejections.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Supplies `catchAs`, `parseBody`, and `refused` (shared error/validation/response helpers).
- **`src/infrastructure/http/ids.ts`** — Supplies `requireId`, which extracts and validates the `:id` route param, returning `null` (and a 404) on failure.
- **`src/infrastructure/http/request.ts`** — Supplies `callerContextOf(request)`, extracting the authenticated caller's context for the service call.
- **`src/infrastructure/http/response.ts`** — Supplies `successResponse`, the standard JSON success envelope.
- **`src/modules/returns/services/index.ts`** — Source of `returnService` (`approveReturn`, `declineReturn`, `withActions`).
- **`src/types/index.ts`** — Provides the `Return` type used as the response payload generic.
- **`src/modules/returns/routes.ts`** — Imports and mounts these two handlers on their respective `POST` routes (with `isAuth` middleware upstream).

## Notes

- Both endpoints are **POST** (not PATCH/PUT) by design — they model state-changing *actions*, not resource replacements, and always return **200** with the current return object (not 204).
- `request.authContext!` uses a non-null assertion; safety is guaranteed by the `isAuth` middleware declared in `routes.ts`. The assertion will throw at runtime if the route is ever registered without that middleware.
- `returnService.withActions(return, authContext)` enriches the plain `Return` record with context-dependent action metadata before it is sent to the client; the raw service result is **not** returned directly.
- The approve handler reads **no** request body; only the decline handler parses one.
