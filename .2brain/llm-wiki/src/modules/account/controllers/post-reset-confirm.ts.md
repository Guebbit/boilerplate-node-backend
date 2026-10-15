---
source: src/modules/account/controllers/post-reset-confirm.ts
sha256: 9f4c372a6f387ec66d55595df53dca9d717959fc711b27152b2516801a575943
generated_at: 2026-10-15T09:55:53.010911+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-reset-confirm.ts

## Purpose

Controller for `POST /account/reset-confirm`. Validates the request body against a Zod schema, then delegates the actual token-spend and password-set logic to `accountService.completePasswordReset`. Handles metric recording, session-cookie destruction on success, and structured error/refusal responses.

## Key elements

- **`postResetConfirm`** (exported function) — The sole export. Accepts an Express `Request`/`Response`, parses the body with `ConfirmPasswordResetBody`, destructures `{ token, password, passwordConfirm }`, and calls `accountService.completePasswordReset(token, password, passwordConfirm, callerContextOf(request))`. On success it increments the `success` metric, destroys the session cookie, and returns a 200 with the i18n string `account.reset.success`. On refusal or thrown error it increments the `failure` metric and responds via `refused` / `catchAs` respectively.

## Relationships

- **`@infrastructure/http/controller`** — Provides the `parseBody`, `refused`, and `catchAs` helpers used for input validation and uniform error/refusal handling.
- **`@infrastructure/http/request`** — `callerContextOf(request)` extracts caller metadata passed to the service.
- **`@infrastructure/http/response`** — `successResponse` builds the 200 JSON envelope.
- **`@infrastructure/i18n`** — `t('account.reset.success')` localises the success message.
- **`src/modules/account/services/index.ts`** — `accountService.completePasswordReset` performs the real token-spend + password-set (atomic per the inline comment).
- **`src/modules/account/session/cookies.ts`** — `destroySessionCookie(response)` clears the session cookie after a successful reset.
- **`src/modules/account/metrics.ts`** — `authPasswordResetConfirmTotal` Prometheus counter, incremented with `status: 'success'` or `'failure'`.
- **`src/modules/account/routes.ts`** — Registers this handler on the `POST /account/reset-confirm` route.
- **`src/types/index.ts`** — Supplies the `PasswordResetConfirmRequest` type for the request body parameter.

## Notes

- The token arrives as a **URL parameter** (from the email link), not from the body. The Zod-parsed body carries `token`, `password`, and `passwordConfirm`; the route param is typed `token?: string` on the Request generic but is not read separately — the body's `token` field is what's passed to the service.
- The order of operations (validation → atomic spend) is deliberately encapsulated in the service layer so that a refused password never burns the one-time link. The controller only handles I/O, metrics, and session cleanup.
- The controller returns the Promise chain (`.then`/`.catch`) rather than using `async/await`, consistent with the `catchAs` helper's expectations.
