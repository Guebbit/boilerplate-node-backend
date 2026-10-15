---
source: src/modules/returns/controllers/post-return-receive.ts
sha256: 58623a4a9e85e5d8a5b032e507a94721ef4eedb99c1caf8ff56eb153de957970
generated_at: 2026-10-15T11:51:48.752843+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/controllers/post-return-receive.ts

## Purpose

HTTP handler for `POST /returns/:id/receive`. When goods arrive back at the warehouse, this endpoint records the receipt, puts the units back on sale, and triggers the customer refund. Responds `200` with the current `Return` object — status `closed` if the refund succeeded, `received` if the provider refused and the refund is queued for a later sweep.

## Key elements

- **`postReturnReceive(request, response)`** — The sole export. Orchestrates the full receive flow:
  1. Validates the `:id` param via `requireId` (404 on missing/invalid).
  2. Parses the (optional) body against `ReceiveReturnBody` — the body may be empty when there is nothing to deduct.
  3. Reads the pre-attached `authContext` (set by upstream `isAuth` middleware) and the caller context.
  4. Calls `returnService.receiveReturn(id, body, callerCtx)`.
  5. On success, enriches the returned `Return` with caller-specific actions via `returnService.withActions`, then sends a `200` response.
  6. On service-level refusal, delegates to the shared `refused` helper (produces the appropriate 4xx).
  7. Any uncaught error is funneled through `catchAs(response, 'postReturnReceive')`.

## Relationships

- **`src/modules/returns/routes.ts`** — registers this handler as the endpoint function for `POST /returns/:id/receive`.
- **`src/modules/returns/services/index.ts`** — the handler's sole business-logic dependency; calls `receiveReturn` (core receive + refund) and `withActions` (adds contextual action metadata to the response payload).
- **`src/infrastructure/http/ids.ts`** — `requireId` extracts and validates the `:id` route parameter.
- **`src/infrastructure/http/controller.ts`** — provides `parseBody` (Zod validation), `refused` (service-error → HTTP-error mapping), and `catchAs` (unhandled-exception guard).
- **`src/infrastructure/http/request.ts`** — `callerContextOf` builds the caller-scoped context object passed to the service.
- **`src/infrastructure/http/response.ts`** — `successResponse` serialises the final JSON payload.
- **`src/types/index.ts`** — supplies the `Return` type used as the response shape.

## Notes

- The request body is **optional** by design; `request.body ?? {}` ensures a missing body still passes `ReceiveReturnBody` validation.
- `request.authContext!` uses a non-null assertion — it is only safe because the `isAuth` middleware runs before this handler. Do not call this function from a route that skips that middleware.
- The handler is a plain exported function, not a class method, consistent with the module's controller style.
- Refund refusal is *not* an HTTP error: the service returns a "refused" result that `refused()` converts to the appropriate status, while the `received` state (waiting for sweep) is returned as a normal `200`.
