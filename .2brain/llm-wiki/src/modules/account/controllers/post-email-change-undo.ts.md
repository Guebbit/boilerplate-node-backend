---
source: src/modules/account/controllers/post-email-change-undo.ts
sha256: 3ba67871b847d3ba782d3845bed169c0ca2db28970c69391e68650c917d5d73e
generated_at: 2026-10-15T09:54:49.292179+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-email-change-undo.ts

## Purpose

HTTP handler for `POST /account/email-change-undo`. Receives a one-time undo token (emailed to the old address), validates the body, and delegates to the account service to revert a previously confirmed email change. The endpoint is public—the token in the request body is the sole credential.

## Key elements

- **`postEmailChangeUndo`** (exported) — Express handler. Validates the body against `ConfirmEmailChangeBody` (zod), calls `accountService.undoEmailChangeByToken(token, callerContext)`, and emits a structured success/error response. Increments the `authEmailChangeUndoTotal` metric on every exit path (validation failure, service refusal, success, exception).

## Relationships

- **`src/modules/account/services/index.ts`** — calls `accountService.undoEmailChangeByToken` to perform the actual revert.
- **`src/modules/account/metrics.ts`** — reads/writes the `authEmailChangeUndoTotal` counter (success/failure).
- **`src/infrastructure/http/controller.ts`** — uses `rejectValidation`, `refused`, and `catchAs` for uniform error/4xx handling.
- **`src/infrastructure/http/request.ts`** — extracts `callerContextOf(request)` (IP, UA, etc.) to pass to the service.
- **`src/infrastructure/http/response.ts`** — uses `successResponse` for the 2xx reply.
- **`src/types/index.ts`** — imports the `VerifyEmailConfirmRequest` type (orval-generated shared `{ token }` shape).
- **`src/modules/account/routes.ts`** — registers this handler on the `POST /account/email-change-undo` route.

## Notes

- The request-body schema is **`ConfirmEmailChangeBody`**, the *same* zod schema used by the confirm endpoint, because both accept `{ token: string }`. This is intentional, not a copy-paste error.
- The TS type name `VerifyEmailConfirmRequest` is misleading: orval names the type after the *first* endpoint that used the shared schema. The actual token type enforced server-side is `email-change-undo`, so a confirm or verify token will be rejected by the service.
- A **409 Conflict** is an expected, non-bug outcome: the old address may have been re-claimed by another user between the change and the undo attempt. `catchAs` maps it to a proper client error rather than a 500.
- No authentication middleware guards this route; security relies entirely on the one-time token's uniqueness and type-scoping.
