---
source: src/modules/returns/controllers/post-return-close.ts
sha256: 610c08b7f62d042460fa96733385f0bfd21fa291567d9afdff319362cc26299c
generated_at: 2026-10-29T05:36:21.465394+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/controllers/post-return-close.ts

## Purpose

HTTP controller handler for `POST /returns/:id/close`. It lets staff finish a received return by hand, then responds 200 with the updated return entity (now in `closed` state).

## Key elements

- **`postReturnClose`** (exported) — The sole handler. Validates the `:id` path param, parses an optional body via `CloseReturnBody` schema, delegates to `returnService.closeReturnByHand`, and responds with the return augmented by available actions.
- **`requireId`** — Extracts and validates the `:id` param; short-circuits with a 404 (`returns.not-found`) if missing.
- **`parseBody(CloseReturnBody, …)`** — Parses the (optional) request body against the Zod schema. An empty body is the common case.
- **`returnService.withActions(result.data, authContext)`** — Wraps the returned entity with context-aware allowed actions before sending.
- **`refused(response, result)`** — Handles a specific rejection path from the service (e.g., already closed) before the success branch.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/infrastructure/http/controller.ts` | Supplies `catchAs`, `parseBody`, `refused` helpers used for error handling and body validation. |
| `src/infrastructure/http/ids.ts` | Supplies `requireId` for path-param extraction and 404 short-circuit. |
| `src/infrastructure/http/request.ts` | Supplies `callerContextOf` to derive the actor context passed to the service. |
| `src/infrastructure/http/response.ts` | Supplies `successResponse` for the final 200 JSON reply. |
| `src/modules/returns/routes.ts` | Registers this function as the handler for `POST /returns/:id/close`. |
| `src/modules/returns/services/index.ts` | Imports `returnService`; calls `closeReturnByHand` and `withActions`. |
| `src/types/index.ts` | Imports the `Return` type used as the generic for `successResponse`. |

## Notes

- The request body is **optional**; `request.body ?? {}` is passed to `parseBody`, so a bare `POST` with no body is valid and expected.
- `request.authContext!` uses a non-null assertion — safety is delegated to the `isAuth` middleware upstream; there is no runtime guard here.
- The handler is promise-chained (`.then`/`.catch`) rather than `async/await`; `catchAs` is the only error sink.
- The Zod schema `CloseReturnBody` is imported from `@api/schemas.zod` (not a graph neighbor listed here) and shapes the optional `note` field.
