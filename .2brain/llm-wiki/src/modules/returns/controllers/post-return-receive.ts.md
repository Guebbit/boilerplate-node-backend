---
source: src/modules/returns/controllers/post-return-receive.ts
sha256: 30e4d3c03975a72b14743900595f2bb39b7527da8c897222d2cedc9f08cdb4a7
generated_at: 2026-10-29T05:36:39.878597+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/controllers/post-return-receive.ts

## Purpose

HTTP controller for `POST /returns/:id/receive`. It marks a returned item as physically received (goods arrived), triggers the refund to the customer, and returns the updated `Return` record — `closed` once the refund succeeds, `received` if the provider refused and the refund is queued for a later sweep.

## Key elements

- **`postReturnReceive`** (exported) — Express handler. Validates the `:id` param, parses an optional JSON body against `ReceiveReturnBody` (Zod), delegates to `returnService.receiveReturn`, and serialises the result (with action links via `returnService.withActions`) into a 200 response.

## Relationships

- **`src/modules/returns/routes.ts`** — registers `postReturnReceive` on the `POST /returns/:id/receive` route.
- **`src/modules/returns/services/index.ts`** — the controller delegates all domain work (`receiveReturn`, `withActions`) to the exported `returnService`.
- **`src/infrastructure/http/controller.ts`** — supplies the shared helpers `requireId`, `parseBody`, `refused`, and `catchAs` used for validation, error mapping, and exception handling.
- **`src/infrastructure/http/request.ts`** — `callerContextOf(request)` extracts caller metadata passed to the service layer.
- **`src/infrastructure/http/response.ts`** — `successResponse` shapes the final JSON envelope.
- **`src/infrastructure/http/ids.ts`** — `requireId` validates and extracts the route parameter, short-circuiting with a 404 if absent.
- **`src/types/index.ts`** — provides the `Return` type used in the response generic.

## Notes

- The request body is **optional**; the handler defaults to `{}` so a bare `POST` with no payload is valid (the common case of "just mark it received").
- Auth is assumed to be enforced upstream by an `isAuth` middleware; the handler uses a non-null assertion (`request.authContext!`) rather than re-checking.
- The `refused` helper inspects the service result and, if the refund was declined, sends an appropriate error response and short-circuits — the `then` chain never reaches `successResponse` in that path.
