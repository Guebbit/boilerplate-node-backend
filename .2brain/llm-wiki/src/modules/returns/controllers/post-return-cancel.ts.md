---
source: src/modules/returns/controllers/post-return-cancel.ts
sha256: e0793962e78a5027d0aff188a729f1b6ddb3a2717ef5c225fe8d4fc015ea12ff
generated_at: 2026-11-08T07:56:16.152315+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/controllers/post-return-cancel.ts

## Purpose

Controller handler for `POST /returns/:id/cancel`, which lets staff cancel an approved return whose goods never arrived. It validates the ID and optional body, delegates to the return service, and responds with 200 and the updated return entity (in its `canceled` state).

## Key elements

- **`postReturnCancel(request, response)`** — the sole export. A plain async-style handler (promise chain) that:
  1. Extracts the `:id` route param via `requireId` (404 on missing/invalid).
  2. Parses the (optional) request body against the `CancelReturnBody` Zod schema.
  3. Reads the guaranteed `request.authContext` (set upstream by `isAuth` middleware).
  4. Calls `returnService.cancelReturn(id, body.note, callerContextOf(request))`.
  5. On success, responds 200 with `returnService.withActions(result.data, authContext)`; on a "refused" result, short-circuits via `refused()`; on unexpected error, delegates to `catchAs`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/infrastructure/http/controller.ts` | Imports `catchAs`, `parseBody`, `refused` — shared HTTP helper utilities. |
| `src/infrastructure/http/ids.ts` | Imports `requireId` for route-param validation. |
| `src/infrastructure/http/request.ts` | Imports `callerContextOf` to forward caller identity into the service call. |
| `src/infrastructure/http/response.ts` | Imports `successResponse` to shape the 200 reply. |
| `src/modules/returns/services/index.ts` | Imports `returnService` and calls `cancelReturn` and `withActions`. |
| `src/modules/returns/routes.ts` | Registers this handler for the `POST /returns/:id/cancel` route. |
| `src/types/index.ts` | Imports the `Return` type used in the response generic. |

## Notes

- **Body is optional.** A `null`/absent body is valid; `parseBody` defaults to `{}`. Canceling without a note is the common case.
- **Auth is assumed present.** `request.authContext!` uses a non-null assertion; it relies on `isAuth` middleware running before this handler. If middleware ordering changes, this will throw at runtime.
- **No class / no `this`.** The handler is a standalone function, consistent with the project's controller convention (see other files in `src/modules/*/controllers/`).
