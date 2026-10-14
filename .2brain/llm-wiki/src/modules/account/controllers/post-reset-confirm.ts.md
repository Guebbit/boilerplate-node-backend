---
source: src/modules/account/controllers/post-reset-confirm.ts
sha256: 938dbdf24668ad62d8cdb25ea4115063ceb6cefc01547c7a9ff7e544b1a4f4e1
generated_at: 2026-10-14T08:36:53.714026+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-reset-confirm.ts

## Purpose

Controller for `POST /account/reset-confirm`. Receives a one-time reset token (from the email link, passed as a URL param) plus the new password in the request body, delegates validation and the atomic token-spend to the account service, and on success clears session cookies and returns a localised success message.

## Key elements

- **`postResetConfirm(request, response)`** — The sole export. Parses the body against `ConfirmPasswordResetBody` (zod), extracts `token`, `password`, `passwordConfirm`, calls `accountService.completePasswordReset`, then either destroys session/logged cookies + sends a 200 success response, or increments the failure metric / re-throws via `catchAs`.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Provides `parseBody` (schema validation), `refused` (normalised error short-circuit), and `catchAs` (error → HTTP mapping).
- **`src/infrastructure/http/request.ts`** — `callerContextOf(request)` extracts caller metadata passed into the service call.
- **`src/infrastructure/http/response.ts`** — `successResponse` builds the 200 JSON reply.
- **`src/infrastructure/i18n/index.ts`** — `t('account.reset.success')` supplies the localised success string.
- **`src/modules/account/services/index.ts`** — `accountService.completePasswordReset` performs the actual token validation, password check, and atomic spend.
- **`src/modules/account/session/cookies.ts`** — `destroySessionCookie` / `destroyLoggedCookie` are called on success to force re-authentication.
- **`src/modules/account/metrics.ts`** — `authPasswordResetConfirmTotal` is incremented with `status: 'success' | 'failure'` on every code path.
- **`src/modules/account/routes.ts`** — Registers this handler at the `POST /account/reset-confirm` route (graph neighbour; not imported here).
- **`src/types/index.ts`** — `PasswordResetConfirmRequest` types the request body for the Express generic.

## Notes

- The token arrives as a **URL parameter** (set by the email link), not from the body — the Express generic encodes this as `Request<{ token?: string }, …>`.
- All token-validity and password-strength checks live in the service (`completePasswordReset`), guaranteeing that a weak/refused password **cannot** burn the one-time link. The controller only orchestrates I/O.
- On success *both* `destroySessionCookie` and `destroyLoggedCookie` are called; forgetting either would leave a stale auth session after a password change.
- Metrics are incremented in all three branches (refused, success, caught error) so the failure gauge covers both application-level rejections and unexpected exceptions.
