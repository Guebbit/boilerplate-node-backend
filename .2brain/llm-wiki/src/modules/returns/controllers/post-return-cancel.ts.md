---
source: src/modules/returns/controllers/post-return-cancel.ts
sha256: e0793962e78a5027d0aff188a729f1b6ddb3a2717ef5c225fe8d4fc015ea12ff
generated_at: 2026-10-29T05:36:11.730849+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/controllers/post-return-cancel.ts

## Purpose

Controller for `POST /returns/:id/cancel`. Allows staff to cancel an approved return whose goods never arrived. Validates the route id and optional body, delegates to the return service, and responds 200 with the return in its new `canceled` state.

## Key elements

- **`postReturnCancel`** (exported function) — The route handler. Extracts `:id`, parses the optional JSON body against `CancelReturnBody`, calls `returnService.cancelReturn`, then wraps the result with `returnService.withActions` before sending a 200 response.
- **`requireId`** — Validates that the `:id` param exists and is a valid id; short-circuits with a 404 (`returns.not-found`) if not.
- **`parseBody`** — Runs the body (or `{}`) through the `CancelReturnBody` Zod schema; short-circuits with 422 on failure.
- **`refused` / `catchAs`** — Standard error-handling helpers from the HTTP layer: `refused` checks for domain-level rejections, `catchAs` catches unexpected exceptions and maps them to a 500.
- **`successResponse`** — Serializes the `Return` object (enriched via `withActions`) into the JSON response.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Source of `parseBody`, `refused`, and `catchAs`; provides the shared request-parsing and error-mapping utilities.
- **`src/infrastructure/http/ids.ts`** — Source of `requireId`; validates the `:id` route parameter.
- **`src/infrastructure/http/request.ts`** — Source of `callerContextOf`; extracts the authenticated caller's context from the request to pass into the service.
- **`src/infrastructure/http/response.ts`** — Source of `successResponse`; formats the 200 JSON reply.
- **`src/modules/returns/routes.ts`** — Registers `postReturnCancel` as the handler for the `POST /returns/:id/cancel` path.
- **`src/modules/returns/services/index.ts`** — Provides `returnService.cancelReturn` (business logic) and `returnService.withActions` (enriches the return with caller-specific action metadata).
- **`src/types/index.ts`** — Provides the `Return` type used as the response payload shape.

## Notes

- The request body is **optional**. Canceling with no note is the common case; `request.body ?? {}` is passed to the parser.
- `request.authContext!` uses a non-null assertion on the grounds that an upstream `isAuth` middleware guarantees its presence.
- The response payload is not the raw return record — it is wrapped by `returnService.withActions(result.data, authContext)`, which adds caller-specific action fields.
