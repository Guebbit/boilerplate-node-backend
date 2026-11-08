---
source: src/modules/returns/controllers/post-return-close.ts
sha256: 610c08b7f62d042460fa96733385f0bfd21fa291567d9afdff319362cc26299c
generated_at: 2026-11-08T07:56:25.620775+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/controllers/post-return-close.ts

## Purpose

Handler for `POST /returns/:id/close`, the endpoint a staff member uses to close a received return by hand. It validates the path id and optional note, delegates to the return service, and replies `200` with the updated `Return` (status now `closed`).

## Key elements

- **`postReturnClose(request, response)`** – sole export. Resolves the return id, parses the (optional) `CloseReturnBody` from the request, extracts the authenticated caller context, calls `returnService.closeReturnByHand(id, note, caller)`, then either responds `200` with the enriched return (`returnService.withActions(result.data, authContext)`) or short-circuits via `refused`.

## Relationships

- **`src/infrastructure/http/controller.ts`** – supplies the shared helpers `catchAs`, `parseBody`, and `refused` used for error handling, schema validation, and service-level rejection responses.
- **`src/infrastructure/http/ids.ts`** – `requireId` validates and extracts the `:id` path parameter (emits a `404` with key `returns.not-found` when missing).
- **`src/infrastructure/http/request.ts`** – `callerContextOf` derives the authenticated actor's context from the request for the service call.
- **`src/infrastructure/http/response.ts`** – `successResponse` wraps the final `200` payload in the project's standard envelope.
- **`src/modules/returns/services/index.ts`** – provides `returnService`, which exposes `closeReturnByHand` (the domain operation) and `withActions` (attaches allowed actions based on the caller).
- **`src/modules/returns/routes.ts`** – mounts `postReturnClose` on the `POST /returns/:id/close` route.
- **`src/types/index.ts`** – source of the `Return` type used as the response payload.

## Notes

- The request body is intentionally optional; a note-less close is the common case. `parseBody` is called with `request.body ?? {}`.
- `request.authContext!` uses a non-null assertion because the `isAuth` middleware (upstream in the route chain) guarantees its presence. The controller does **not** perform its own auth check.
- The handler uses a promise chain (`.then` / `.catch`) rather than `async/await`, consistent with the `catchAs` helper's design.
