---
source: src/modules/account/controllers/post-email-change-resend.ts
sha256: b7b4cba13b03482dc2f1d60252bbe0b21f47a7c0d1d64c0dd5703fc8e06d3560
generated_at: 2026-11-08T04:04:42.144584+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-email-change-resend.ts

## Purpose

Thin HTTP adapter that handles `POST /account/email-change/resend`. It extracts the authenticated user's id, delegates to `accountService.resendPendingEmailVerificationFor`, and translates the result (or refusal) into a standard HTTP response. Exists to keep the account service free of Express-specific concerns.

## Key elements

- **`postPendingEmailResend(request, response)`** — The sole export. Reads `request.authContext!.id`, calls `accountService.resendPendingEmailVerificationFor(id, callerContextOf(request))`, then responds via `successResponse` (success) or `refused` (business-level rejection). All thrown errors are funnelled through `catchAs(response, 'postPendingEmailResend')`.

## Relationships

- **`src/modules/account/services/index.ts`** — Imports `accountService`; calls `resendPendingEmailVerificationFor` with the caller context.
- **`src/infrastructure/http/controller.ts`** — Imports `catchAs` (error→HTTP mapping) and `refused` (business-rejection short-circuit).
- **`src/infrastructure/http/request.ts`** — Imports `callerContextOf` to build the caller context passed to the service.
- **`src/infrastructure/http/response.ts`** — Imports `successResponse` to shape the JSON success reply.
- **`src/modules/account/routes.ts`** — Registers `postPendingEmailResend` as the handler for the `POST /account/email-change/resend` route (behind the `isAuth` middleware).

## Notes

- Auth is guaranteed upstream by the `isAuth` middleware; the `!` non-null assertion on `request.authContext` is safe only because of that contract.
- "Nothing pending" is **not** an error path — the service returns `resendAfter: 0` and the controller sends a normal success response.
- Behaviour intentionally mirrors `POST /account/email-verification/resend`: same response shape (seconds until next resend) and same non-error semantics for the empty case.
