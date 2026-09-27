---
source: src/modules/account/services/authentication.ts
sha256: c12a9ff5f90462859819a4fea932bda9a4c045bc9b7bd7c940ff89a6c8dda720
generated_at: 2026-09-27T14:29:04.871658+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/authentication.ts

## Purpose

Handles the full "proving who you are" flow: signup, login, password-reset token issuance, account-deletion token issuance, session revocation, logout, and refresh-token rotation. It is the write-path for everything that issues or revokes a token on a user document. Deliberately excluded: credential hashing (model pre-save hook), JWT signing (`../session/jwt`), and password *changes* (`./profile`).

## Key elements

- **`tokenAdd(user, type, expirationTime?)`** — Generates a 32-hex-char token via `randomBytes(16)` and delegates to `userService.tokenAdd` (a `$push` onto the `tokens` array). The single door every token-issuing flow passes through.
- **`requestPasswordReset(email, context)`** — Looks up the user by email, issues a reset token, queues a high-priority mail in the user's own locale. Returns `false` (not an error) for unregistered addresses so the HTTP response is always 200 — the anti-enumeration contract.
- **`requestAccountDeletion(user, context)`** — Issues a delete-confirmation token (TTL 1 h), sends the mail, records an audit event. Token value never escapes this function.
- **`requestAccountSetup(user)`** — Issues a setup-token for an admin-created user with no password; reuses the reset token type and TTL. No `CallerContext`, so no audit here (already recorded in `users`).
- **`sessionRevoke(userId, sessionId, context)`** — Removes one session; audits only when `modifiedCount > 0` to avoid logging phantom revocations.
- **`logoutCurrentSession(refreshToken?, context)`** — Removes the caller's refresh token if present (absence is not a failure), always audits, and emits an analytics event.
- **`refreshAccessToken(refreshToken?, context)`** — Rotates the refresh token via `rotateRefreshToken`, returns new access + refresh tokens and cookie `maxAge`. Distinguishes *missing*, *invalid*, and *reuse-detected* (`TokenReuseError`) outcomes with separate audit actions.
- **`PASSWORD_RESET_TOKEN_TTL_MS`** — Read from `NODE_PASSWORD_RESET_TTL_MS` (default 1 h, minimum 1 ms).
- **`DUMMY_PASSWORD_HASH`** — A one-time `bcrypt.hashSync` of 32 random bytes; compared on unknown-email logins to equalize timing and prevent address enumeration.
- **`ACCOUNT_DELETE_TOKEN_TYPE`** / **`PASSWORD_RESET_TOKEN_TYPE`** — Named constants so the token-type string lives in one place.
- **`MissingRefreshTokenError`** — Internal class so the single `catch` in `refreshAccessToken` can distinguish "no cookie" from "bad cookie" without branching the happy path.

## Relationships

- **`@modules/users`** (`userService`) — All token `$push`/`$pull`, `findByEmail`, and `sessionRemove` operations delegate here; this file never writes to the `tokens` array directly.
- **`../session/jwt`** (`rotateRefreshToken`, `TokenReuseError`) — The sole implementation of refresh-token rotation; this file orchestrates the audit/analytics around it.
- **`src/infrastructure/observability/audit.ts`** (`recordAudit`) — Every state-changing call (reset, delete, revoke, logout, refresh, reuse-detect) records an audit row here.
- **`src/infrastructure/observability/analytics/index.ts`** — Emits `USER_LOGGED_OUT` analytics on logout; `buildAnalyticsBase` supplies the shared event envelope.
- **`src/modules/account/analytics.ts`** — Provides the `accountAnalyticsEvents` enum used for analytics event names.
- **`src/infrastructure/i18n`** (`getCurrentLocale`, `t`) — Resolves locale for error/success messages and for selecting the recipient's language when composing token emails.
- **`src/infrastructure/runtime/environment.ts`** (`environmentNumber`) — Reads the reset-token TTL from the environment.
- **`src/infrastructure/security/breached-passwords/index.ts`** (`assertPasswordNotBreached`) — Called during signup/credential-creation to reject passwords in known breach corpora.
- **`src/infrastructure/adapters/antibot.ts`** (`checkEmailPolicy`) — Guards signup/reset flows against bot traffic.
- **`src/infrastructure/http/response.ts`** / **`src/infrastructure/http/errors.ts`** / **`src/infrastructure/http/request.ts`** / **`src/infrastructure/http/schemas.ts`** — Provide the response-envelope builders (`generateSuccess`, `generateReject`), the database-error envelope (`rejectDatabaseEnvelope`), form parsing (`parseFormBoolean`), and the `optionalBooleanSchema` used by login/signup validation.
- **`src/modules/access/index.ts`** (`assignDefaultRole`) — Called after signup to grant the new user their initial role.
- **`src/kernel/access/tenant.ts`** (`DEPLOYMENT_TENANT_ID`) — Supplies the tenant identifier stamped onto new accounts at creation.

## Notes

- **Token array is append-only.** `tokenAdd` uses `$push` via `userService`. Never reassign `user.tokens = [...]` — a concurrent request in the read-then-write window would silently erase the other caller's token. The `tokens` field is where sessions and reset links routinely collide.
- **Token values are file-local.** `requestPasswordReset`, `requestAccountDeletion`, and `requestAccountSetup` all keep the raw token inside the promise chain and pass it only to the mail builder. Exposing it upward would hand a live credential to a layer that should not hold one.
- **Silent-on-unknown is the contract.** `requestPasswordReset` returns `false` (not a throw) for unregistered addresses; the controller still answers 200. The boolean is for the caller's internal metric/audit, never a client-visible 4xx.
- **Recipient locale ≠ request locale.** Token emails are composed in the *account's* stored language (`user.locale`), using the request locale only as fallback. The finished text is what goes to the mail queue, so the worker needs no locale.
- **`refreshAccessToken` has three audit outcomes, not two.** Missing token, invalid token, and *reuse of an already-rotated token* (`TokenReuseError`) each get distinct `accountAuditActions` entries. Reuse is a different fact in the security trail than staleness.
- **The service is a folder.** The module doc (`./index`) explains why: the file is large enough and the concerns (authentication vs. profile vs. session) are separated enough that a single file would blur the seams.
