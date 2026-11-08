---
source: src/modules/account/services/password-reset.ts
sha256: 4d124d4768d6e3fa4e0307b1c09574fa1613243283ec5eeec2f99d3ab04f93a7
generated_at: 2026-11-08T04:20:15.770397+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/password-reset.ts

## Purpose
Completes a password reset triggered by a mailed link. Validates the password pair, looks up the live token, rejects breached passwords, atomically spends the token, writes the new password (clearing MFA lock and marking the address verified), then fires off an audit row and a confirmation email. The request-side is in `./password-reset-request`.

## Key elements
- **`completePasswordReset`** *(exported)* — Entry point for `POST /account/password/reset/confirm`. Runs validation → token lookup → `resetWith` → DB-error envelope in that order.
- **`resetWith`** *(internal)* — Breach-check → `spendLiveToken` → `writePassword` (with `markResetCompleted` callback) → `afterReset`. The spend is deliberately last so a refused password never burns the link.
- **`afterReset`** *(internal)* — Post-success side-effects: `recordAccountAudit` (fire-and-forget) and `sendAccountMail` with `resetConfirmEmail` (fire-and-forget, normal priority).
- **`markResetCompleted`** *(internal)* — Callback passed to `writePassword`: zeroes `mfaFailures`, clears `mfaLockedUntil`, calls `markVerified`.
- **`resetLinkRefused`** *(internal)* — Returns the shared 422 that `refuseLink` produces for unknown, expired, or already-used tokens (intentionally indistinguishable).

## Relationships
- **`./tokens`** — `findLiveToken` locates the account; `spendLiveToken` is the atomic delete that settles concurrent uses; `refuseLink` builds the 422.
- **`./password`** — `validatePasswordChange` checks shape/match; `writePassword` persists the new hash and invokes `markResetCompleted`.
- **`./mail` / `../emails`** — `sendAccountMail` enqueues the confirmation; `resetConfirmEmail`, `greetableName`, `recipientLocale` shape the message.
- **`./verification`** — `markVerified` is called inside `markResetCompleted`.
- **`./caller` / `../audit`** — `recordAccountAudit` + `accountAuditActions.AUTH_PASSWORD_RESET_COMPLETED` write the audit row.
- **`@infrastructure/security/breached-passwords`** — `assertPasswordNotBreached` gates the spend.
- **`@infrastructure/http/response` / `errors`** — `generateReject`, `ResponseSuccess/Reject` types, and `rejectDatabaseEnvelope` for the DB catch.
- **`../token-types`** — `PASSWORD_RESET_TOKEN_TYPE` constant.
- **`@modules/users`** — `UserDocument` type used throughout.
- **`@infrastructure/adapters/logger`** — warn-level log if the fire-and-forget audit lookup fails.
- **`./index`** — barrel re-export of this module.

## Notes
- **Spend order is load-bearing.** Everything before `spendLiveToken` is a read; the spend is the atomic delete. A breached or mismatched password never consumes the token.
- **All dead-link cases return the same 422.** Unknown, expired, and already-used are deliberately indistinguishable to the caller.
- **Audit and email are fire-and-forget.** A queue or lookup hiccup after a successful write must not flip the response to an error. `sendAccountMail` never rejects (it logs internally); `recordAccountAudit` rejections are caught and logged at warn level.
- **Locale:** the confirmation email uses the user's stored locale first; `context` (request `Accept-Language`) is only the fallback, since the link is often opened on a borrowed device.
- **`oauthAccounts` is `select: false`** in the reset query, but schema types claim it is always loaded. An eslint disable documents the mismatch; the code uses `?? []` to handle the absent case.
