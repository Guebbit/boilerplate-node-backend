---
source: src/modules/returns/controllers/post-return-decision.ts
sha256: c6c14194a8759b65f737e054eeb2f7c4f8d7f4c91a8d3b9ce63678bf5017c40c
generated_at: 2026-10-15T11:51:37.190309+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/controllers/post-return-decision.ts

## Purpose

Thin Express handlers for the two staff decision actions on a return request — `POST /returns/:id/approve` and `POST /returns/:id/decline`. Each validates input, delegates to `returnService`, enriches the result with available actions, and sends a `200` response containing the updated `Return` object.

## Key elements

- **`postReturnApprove`** — Reads the return `id` from params, calls `returnService.approveReturn(id, callerContext)`, enriches via `withActions`, and responds `200` with the `Return` payload. No request body is required.
- **`postReturnDecline`** — Same flow as approve, but additionally parses and validates the request body against the `DeclineReturnBody` Zod schema (requiring a `reason` string) before calling `returnService.declineReturn(id, reason, callerContext)`.

## Relationships

- **`src/modules/returns/services/index.ts`** — Calls `returnService.approveReturn`, `returnService.declineReturn`, and `returnService.withActions` for all business logic and response enrichment.
- **`src/infrastructure/http/controller.ts`** — Uses `requireId` (via `ids.ts`), `parseBody`, `refused`, and `catchAs` for input validation, refusal short-circuit, and error handling.
- **`src/infrastructure/http/request.ts`** — Uses `callerContextOf(request)` to derive the caller context passed to the service.
- **`src/infrastructure/http/response.ts`** — Uses `successResponse` to emit the final `200` JSON body.
- **`src/infrastructure/http/ids.ts`** — Uses `requireId` to extract and validate the `:id` param (sends `404` with `returns.not-found` code on failure).
- **`src/modules/returns/routes.ts`** — Registers `postReturnApprove` and `postReturnDecline` as the handlers for the two POST routes.
- **`src/types/index.ts`** — Imports the `Return` type used as the generic on `successResponse`.

## Notes

- Both endpoints respond with **200** (not 201/204), intentionally returning the return's current state after the action.
- `request.authContext!` uses a non-null assertion; the `isAuth` middleware (applied at the route level) guarantees it is present.
- The approve handler does **not** accept or validate a request body, while the decline handler **requires** one (`DeclineReturnBody`).
- `catchAs(response, 'postReturnApprove' | 'postReturnDecline')` is used as a uniform `.catch` that serializes errors into the standard error response; the string argument is the error source label.
