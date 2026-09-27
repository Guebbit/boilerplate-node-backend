---
source: src/modules/account/controllers/delete-account-confirm.ts
sha256: 230e5b3adc40a1f1f7c7aa341b11c0f2b89263919faad8b2d4a4e37b33004524
generated_at: 2026-09-27T14:22:41.131944+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/delete-account-confirm.ts

## Purpose

Express controller for `DELETE /account/delete-confirm`. It validates (and consumes) a one-time account-deletion token, then hard-deletes the account, destroys the session cookies, and returns a localized success or error message.

## Key elements

- **`deleteAccountConfirm`** (default export) — Express handler. Parses the body against the `ConfirmAccountDeleteBody` Zod schema, calls `accountService.redeemLiveToken(ACCOUNT_DELETE_TOKEN_TYPE, token)` to redeem the one-time token, then calls `accountService.removeOwnAccount` to perform the hard-delete. On success it destroys the refresh and "logged-in" cookies and sends a 200 with a localized message. On a missing/expired token it returns 422. Database failures are routed through `rejectDatabaseError`.

## Relationships

- **`src/modules/account/routes.ts`** — Registers this handler on the `DELETE /account/delete-confirm` route.
- **`src/modules/account/services/index.ts`** — Supplies `accountService` (token redemption + account removal) and the `ACCOUNT_DELETE_TOKEN_TYPE` constant.
- **`src/modules/account/session/cookies.ts`** — Provides `destroyRefreshCookie` and `destroyLoggedCookie`, both called after a successful deletion to end the session.
- **`src/infrastructure/http/controller.ts`** — Provides `parseBody` (Zod body validation with early-return on failure).
- **`src/infrastructure/http/response.ts`** — Provides `successResponse` and `rejectResponse` helpers used for all HTTP replies in this file.
- **`src/infrastructure/http/errors.ts`** — Provides `rejectDatabaseError`, the shared interpreter that maps recognised database failures to their own status codes instead of a flat 500.
- **`src/infrastructure/http/request.ts`** — Provides `callerContextOf`, used to pass caller metadata into `removeOwnAccount`.
- **`src/infrastructure/i18n/index.ts` / `context.ts`** — Supplies the `t()` function for all user-facing strings in this controller.
- **`src/types/index.ts`** — Declares the `AccountDeleteConfirmRequest` type used for the typed `Request` generic.

## Notes

- The token is **redeemed** (consumed), not merely validated — `redeemLiveToken` makes it single-use.
- The goodbye email is sent inside the service layer (`removeOwnAccount`), because after that call the account document no longer exists and the email address can no longer be read.
- An invalid or already-used token yields **422**, not 401/403, consistent with the "unprocessable entity" convention used elsewhere in the account module.
