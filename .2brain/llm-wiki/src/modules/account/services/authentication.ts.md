---
source: src/modules/account/services/authentication.ts
sha256: 166f475182045898cc501d44f59ffca3594becce7d0dd12cad38cf82690741bb
generated_at: 2026-09-23T18:08:29.038836+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/authentication.ts

## Purpose

Central service for establishing identity (signup, login) and managing authentication tokens (issuance, rotation, revocation). All flows that issue or revoke a token go through the two write paths here (`tokenAdd`, and the token-removal helpers). Deliberately excludes credential hashing (model pre-save hook), JWT signing (`../session/jwt`), and password changes (`./profile`).

## Key elements

- **`tokenAdd(user, type, expirationTime?)`** — Generates a 16-byte hex token and appends it to the user's `tokens` array via `userService.tokenAdd`. The canonical door for all token writes.
- **`requestAccountDeletion(user, context)`** — Issues a 1-hour `delete` token, emails the link (high priority), and records an audit event. Token value never leaves this file.
- **`PASSWORD_RESET_TOKEN_TYPE`** — Exported constant (`'password'`) identifying the token type for reset/setup links.
- **`PASSWORD_RESET_TOKEN_TTL_MS`** — Resolved from `NODE_PASSWORD_RESET_TTL_MS` env (default 1 h). Governs reset/setup token lifetime.
- **`requestPasswordReset(email, context)`** — Looks up the user by email; if found, issues a reset token and emails it. Returns `true`/`false` (caller-facing metric only); unregistered addresses produce no observable difference (anti-enumeration).
- **`requestAccountSetup(user)`** — Same token type/TTL as reset, but sends the `setupRequestEmail` copy. Sole caller is the `users` module's `USER_SETUP_REQUESTED` event.
- **`sessionRevoke(userId, sessionId, context)`** — Deletes a session by ID; audits only when `modifiedCount > 0`.
- **`logoutCurrentSession(refreshToken, context)`** — Removes the named refresh token (if present) and records audit + analytics unconditionally.
- **`refreshAccessToken(refreshToken, context)`** — Rotates the refresh token via `rotateRefreshToken`, returns new access/refresh pair + `refreshMaxAgeMs`. Distinguishes _token reuse_ (`TokenReuseError`) from _missing/invalid_ in both audit and error responses.
- **`MissingRefreshTokenError`** — Internal sentinel so the shared `catch` can differentiate "no cookie" from "invalid token" without the happy path branching twice.
- **`DUMMY_PASSWORD_HASH`** — Precomputed bcrypt hash (cost 12) used to equalize timing for unknown-email logins (timing-oracle prevention).

## Relationships

- **`@infrastructure/adapters/mailer`** — `enqueueEmail` delivers all token-bearing links (deletion, reset, setup) as high-priority jobs.
- **`@infrastructure/adapters/antibot`** — `checkEmailPolicy` (imported; used in the truncated signup/login region).
- **`@infrastructure/observability/audit`** — `recordAudit` logs every token issuance, revocation, refresh, and logout.
- **`@infrastructure/observability/analytics`** — `emitAnalyticsEvent` / `buildAnalyticsBase` emit a `USER_LOGGED_OUT` event on `logoutCurrentSession`.
- **`@infrastructure/runtime/environment`** — `environmentNumber` resolves the reset-token TTL from `NODE_PASSWORD_RESET_TTL_MS`.
- **`@infrastructure/i18n`** — `getDefaultLocale` participates in the locale-resolution chain (user locale → request locale → default) for outgoing mail.
- **`@infrastructure/http/response` / `errors` / `request` / `schemas`** — Provide the HTTP envelope helpers, form-parsing, and validation schemas used by the signup/login handlers in the truncated portion.
- **`@infrastructure/security/breached-passwords`** — `assertPasswordNotBreached` guards password creation (truncated section).
- **`@kernel/access/tenant`** — `DEPLOYMENT_TENANT_ID` scopes tenant-aware logic (truncated section).
- **`@modules/access`** — `assignDefaultRole` grants the initial role during signup (truncated section).
- **`../session/jwt`** — `rotateRefreshToken` and `TokenReuseError` underpin the refresh flow.
- **`../emails`** — `deleteRequestEmail`, `resetRequestEmail`, `setupRequestEmail` render the finished mail templates consumed here.
- **`../analytics` / `../audit`** — Named event/action constants (`accountAnalyticsEvents`, `accountAuditActions`) so this file never hard-codes strings.

## Notes

- **Token array is append-only.** `tokenAdd` uses a `$push`; writing the whole array back (`user.tokens = [...]`) would clobber concurrent additions (two sessions + a reset link).
- **Token values are file-private.** Every issuer (`requestAccountDeletion`, `requestPasswordReset`, `requestAccountSetup`) resolves the token inside the function and passes it directly to the mailer — no caller ever receives the raw credential.
- **Locale chain for mail:** `user.locale ?? context.locale ?? getDefaultLocale()`. The email body is fully rendered before enqueuing, so the worker needs no locale.
- **Anti-enumeration is the contract.** `requestPasswordReset` returns a boolean for the caller's internal metric; the HTTP response is always 200. `login` burns a bcrypt comparison against `DUMMY_PASSWORD_HASH` for unknown emails.
- **`refreshAccessToken` has four distinct audit outcomes** (success, missing, invalid, reuse) rather than folding reuse into "invalid," because a reused token is a materially different security signal.
- The service is a **folder**, not a single file — see `./index` for the routing rationale.
