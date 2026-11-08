---
source: src/modules/account/controllers/post-email-change-undo.ts
sha256: 3501aace490b7de337e78a7e440ce73243e355aee5a0f0f8c7dc5f2e02c89c3a
generated_at: 2026-11-08T04:04:51.922571+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-email-change-undo.ts

## Purpose

HTTP controller for `POST /account/email-change/undo`. It validates a `{ token }` body, delegates to the account service to spend a one-time undo token (reverting the account to its pre-change state), and returns `204 No Content` on success. The endpoint is public—possession of the token is the sole credential.

## Key elements

- **`postEmailChangeUndo`** (exported const) — the route handler. Accepts `Request`/`Response` (Express), expects a `VerifyEmailConfirmRequest`-shaped body (`{ token }`). Flow:
  1. `parseBody` validates the body against `ConfirmEmailChangeBody` (Zod schema).
  2. Calls `accountService.undoEmailChangeByToken(token, callerContextOf(request))`.
  3. On `refused` → 4xx response + failure metric.
  4. On success → `noContentResponse` (204) + success metric.
  5. On thrown error → `catchAs(response, 'postEmailChangeUndo')` maps the error (including a possible 409 if the old address was re-claimed) and records a failure metric.
- **Metric** — every path (validation failure, service refusal, success, exception) increments `authEmailChangeUndoTotal` with a `status` label.

## Relationships

- **`src/infrastructure/http/controller.ts`** — provides `parseBody` (Zod validation + 400), `refused` (maps service rejection results to 4xx), and `catchAs` (maps thrown errors, including 409, to an HTTP response).
- **`src/infrastructure/http/request.ts`** — `callerContextOf` extracts the IP/user-agent context passed to the service.
- **`src/infrastructure/http/response.ts`** — `noContentResponse` emits the final `204`.
- **`src/modules/account/services/index.ts`** — `accountService.undoEmailChangeByToken` performs the actual token spend and account revert.
- **`src/modules/account/metrics.ts`** — `authEmailChangeUndoTotal` counter, incremented on every terminal path.
- **`src/types/index.ts`** — `VerifyEmailConfirmRequest` type (shared with the confirm endpoint because both take `{ token }`).
- **`src/modules/account/routes.ts`** — registers this handler at the `POST /account/email-change/undo` route.

## Notes

- The request body type is `VerifyEmailConfirmRequest` (inherited from the confirm endpoint) because both endpoints share the same `{ token }` shape; the Zod schema used for validation is `ConfirmEmailChangeBody`. The token *type* distinguishes undo from confirm at the service layer—a confirm/verify token will never match an undo lookup, so cross-endpoint misuse is structurally impossible.
- A `409 Conflict` is an expected, non-buggy response: the old email address may have been registered by another account between the change and the undo attempt.
- The endpoint is intentionally unauthenticated (no session/JWT); the one-time token in the body is the sole credential.
