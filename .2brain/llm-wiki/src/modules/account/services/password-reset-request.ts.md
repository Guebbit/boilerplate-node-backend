---
source: src/modules/account/services/password-reset-request.ts
sha256: ccbfff4ceb5c2ded0493ac745f692b1351cad23dadc59fdab6651558ed393cfd
generated_at: 2026-11-14T18:47:03.179957+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/password-reset-request.ts

## Purpose

Handles the two email-delivery paths that hand a user a password-reset/setup link: the public "I forgot my password" request (always returns 200, never reveals whether the address is registered) and the one-time setup link sent to an admin-created account. It does **not** consume the link — that lives in `./password-reset`.

## Key elements

- **`RESET_REQUEST_SECONDS`** (exported const, `60`) — cooldown window between two reset mails to the same account.
- **`resetRecentlySent`** (internal) — checks whether the account's live reset token was minted within the cooldown window via `tokenSentAt` + `cooldownRemaining`.
- **`issueResetToken`** (internal) — atomically upserts the account's single live `PASSWORD_RESET_TOKEN_TYPE` token (TTL from `accountConfig().NODE_PASSWORD_RESET_TTL_MS`); previous token is invalidated in the same write.
- **`mailResetLink`** (internal) — composes the reset email (locale-resolved), queues it via `sendAccountMail`, and returns a boolean for whether mail was actually sent.
- **`requestPasswordReset`** (exported) — public entry point. Looks up the user by email, calls `mailResetLink`, and always resolves to a `boolean` (never rejects). Records the `AUTH_PASSWORD_RESET_REQUESTED` audit row and the `authPasswordResetTotal` metric unconditionally.
- **`requestAccountSetup`** (exported) — issues a token and sends the setup-link email for an admin-created account with no password. Only caller is the `USER_SETUP_REQUESTED` event in the `users` module; no audit is recorded here (the `ADMIN_USER_CREATED` audit already fired at creation time).

## Relationships

- **`src/modules/account/config.ts`** — reads `NODE_PASSWORD_RESET_TTL_MS` from `accountConfig()` to set token expiry.
- **`src/modules/account/cooldown.ts`** — delegates to `cooldownRemaining` to enforce the 60-second pacing rule.
- **`src/modules/account/emails.ts`** — calls `resetRequestEmail`, `setupRequestEmail`, `greetableName`, and `recipientLocale` to build the mail body before enqueuing.
- **`src/modules/account/services/mail.ts`** — enqueues the composed mail via `sendAccountMail` (fire-and-forget; never rejects).
- **`src/modules/account/token-types.ts`** — uses `PASSWORD_RESET_TOKEN_TYPE` so the reset token and the setup token share the same single-slot type.
- **`src/modules/account/services/tokens.ts`** — calls `issueToken` (upsert) and `tokenSentAt` (read `sentAt`) for the live token.
- **`src/modules/users/index.ts`** — imports the `UserDocument` type.
- **`src/modules/users/friends/account.ts`** — imports `accountUserService` and calls `findByEmail` to resolve the account from the submitted address.
- **`src/modules/users/model.ts`** — provides the `UserDocument` type consumed by the service functions.
- **`src/infrastructure/observability/audit.ts`** — calls `recordAudit` on every invocation, success or failure.
- **`src/modules/account/audit.ts`** — supplies the `AUTH_PASSWORD_RESET_REQUESTED` action constant.
- **`src/modules/account/metrics.ts`** — increments `authPasswordResetTotal` with a `success`/`failure` label.
- **`src/infrastructure/adapters/logger.ts`** — logs an error (and swallows it from the caller) when the async chain rejects.
- **`src/modules/account/services/index.ts`** — re-exports this module as part of the account services barrel.
- **`src/modules/users/index.ts`** / **`src/modules/users/friends/account.ts`** — `requestAccountSetup` is invoked by the `users` module's `USER_SETUP_REQUESTED` event handler, making the `users` module an upstream caller.

## Notes

- **Silent pacing, not 429.** A request inside the cooldown window returns the same 200 with no mail and no new token. The existing (still-valid) link is left untouched. A `429` would let an attacker enumerate registered addresses.
- **Audit fires unconditionally.** Even a DB-lookup failure or an unregistered address produces an `AUTH_PASSWORD_RESET_REQUESTED` row, so the audit log cannot be used for enumeration either.
- **Token value never leaves this file.** The plaintext token is interpolated into the email body and never stored elsewhere or returned to the caller.
- **`requestAccountSetup` has no `CallerContext`.** It is only invoked from the `users` module's event handler, so there is nothing to audit and no locale fallback beyond the user's stored preference.
- **The boolean return of `requestPasswordReset` is for tests/metrics only.** It is never surfaced to the client; the HTTP response is always 200.
