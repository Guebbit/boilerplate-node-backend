---
source: src/modules/returns/controllers/post-return-receive.ts
sha256: 30e4d3c03975a72b14743900595f2bb39b7527da8c897222d2cedc9f08cdb4a7
generated_at: 2026-11-08T07:56:45.964224+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/controllers/post-return-receive.ts

## Purpose

HTTP controller for `POST /returns/:id/receive`. Validates the incoming request, delegates to the returns service to put units back on sale and refund the customer, then responds with the updated `Return` entity (status `closed` on successful refund, `received` when a provider-refused refund is pending a sweep retry).

## Key elements

- **`postReturnReceive`** (exported) — Express handler that:
  1. Extracts and validates the `:id` route param via `requireId`.
  2. Parses the (optional) JSON body against `ReceiveReturnBody` (zod schema); defaults to `{}` when no body is sent.
  3. Reads the pre-attached `request.authContext` (set by upstream `isAuth` middleware).
  4. Calls `returnService.receiveReturn(id, body, callerContextOf(request))`.
  5. If the service result is a refusal, short-circuits via `refused()`; otherwise sends `200` with `returnService.withActions(result.data, authContext)` shaped as a `Return`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/infrastructure/http/controller.ts` | Imports `catchAs`, `parseBody`, `refused` for error handling, body validation, and refusal detection. |
| `src/infrastructure/http/ids.ts` | Imports `requireId` to extract and validate the `:id` param. |
| `src/infrastructure/http/request.ts` | Imports `callerContextOf` to build the caller context passed to the service. |
| `src/infrastructure/http/response.ts` | Imports `successResponse` to emit the 200 payload. |
| `src/modules/returns/routes.ts` | Registers `postReturnReceive` as the handler for `POST /returns/:id/receive`. |
| `src/modules/returns/services/index.ts` | Imports `returnService`; calls `.receiveReturn(...)` and `.withActions(...)` on it. |
| `src/types/index.ts` | Imports the `Return` type for the response generic. |

## Notes

- The request body is **optional**: `request.body ?? {}` means the endpoint works with an empty body, which is the common case (no deduction).
- `request.authContext!` uses a non-null assertion — the file relies on an upstream `isAuth` middleware having already set it; calling this handler without that middleware will throw at runtime.
- The service result is checked with `refused()` **before** any success response is written; if refused, the controller returns early and the refusal utility handles the status code / payload.
