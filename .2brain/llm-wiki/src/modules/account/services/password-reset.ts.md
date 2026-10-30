---
source: src/modules/account/services/password-reset.ts
sha256: 50c3f38725eb1b2a1216061c2faf89ec440b443bb93fb015e1357619525c4d2e
generated_at: 2026-10-29T02:42:27.891442+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/password-reset.ts

## Purpose

Handles the final step of a password reset (`POST /account/password/reset/confirm`): validates the new password, resolves the one-time token from the mailed link, enforces the breached-password check, atomically spends the token, writes the new credential, and fires the post-reset audit and confirmation email. It is the counterpart to `password-reset-request`, which issues the link.

## Key elements

- **`completePasswordReset`** (export) — Entry point. Validates the password pair, calls `findLiveToken` (a read), then delegates to `resetWith`. Catches database errors into a standard reject envelope.
- **`resetWith`** (private) — Runs the breach check, then `spendLiveToken` (the atomic delete), then `writePassword` with `markResetCompleted` as the side-effect hook, finally `afterReset`.
- **`markResetCompleted`** (private) — Clears `mfaFailures` and `mfaLockedUntil`, and calls `markVerified` on the user document.
- **`afterReset`** (private) — Fire-and-forget audit row (`recordAccountAudit`) and confirmation email (`sendAccountMail`). Both are non-blocking; a failure here only logs, never fails the reset.
- **`resetLinkRefused`** (private) — Builds the uniform 422 reject for any dead token (unknown, expired, or already spent) via `refuseLink`.

## Relationships

- **`./tokens`** — `findLiveToken` (read) and `spendLiveToken` (atomic delete) implement the find/spend split that prevents double-use of one link.
- **`./password`** — `validatePasswordChange` checks shape/match; `writePassword` performs the credential write and emits the `account.sessions-revoked` event.
- **`./verification`** — `markVerified` clears the address-verification flag as part of `markResetCompleted`.
- **`./mail`** — `sendAccountMail` enqueues the confirmation email (normal priority, fire-and-forget).
- **`../emails`** — `resetConfirmEmail`, `greetableName`, `recipientLocale` build the outbound message.
- **`./caller`** — `recordAccountAudit` writes the audit row for the completed reset.
- **`../audit`** — Provides the `accountAuditActions.AUTH_PASSWORD_RESET_COMPLETED` enum value.
- **`@infrastructure/security/breached-passwords`** — `assertPasswordNotBreached` is the gate before the token is spent.
- **`@infrastructure/http/response`** — `generateReject`, `ResponseSuccess`, `ResponseReject` shape the return values.
- **`@infrastructure/http/errors`** — `rejectDatabaseEnvelope` wraps unexpected DB failures.
- **`@infrastructure/adapters/logger`** — Logs the swallowed audit-lookup failure as a warning.
- **`../token-types`** — `PASSWORD_RESET_TOKEN_TYPE` identifies which token family to find/spend.
- **`@modules/users`** — `UserDocument` type for the account being modified.

## Notes

- **Spend is deliberately last.** Everything before `spendLiveToken` is a read (validate, find, breach check). A rejected password or a breached password never burns the one-time link. The spend is the atomic delete that settles two concurrent uses of the same token.
- **Dead links are indistinguishable.** Unknown, expired, and already-used tokens all return the same 422 via `resetLinkRefused`; the caller cannot tell which case occurred.
- **Audit and mail are fire-and-forget.** Both are `void`ed promises with `.catch` that only logs. A queue outage or a lookup hiccup after the password write succeeds must not surface as an error to the client.
- **Locale resolution.** The confirmation email uses the user's stored locale first and the request's `Accept-Language` only as a fallback, because the link is typically clicked from an email client on an unrelated device.
- **`oauthAccounts` is `select: false`.** The code uses `user.oauthAccounts ?? []` with an eslint-disable to guard against the schema type claiming it is always loaded.
- **Same find/spend pattern as `two-factor-challenge.ts`** for login challenges.
