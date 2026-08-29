# src/modules/account/services/authentication.ts

## Purpose

Central authentication service that manages the *lifecycle* of identity tokens (issue, revoke, refresh) and the high-level flows built on them (signup, password reset, account deletion, session logout). It deliberately excludes credential *value* operations: hashing lives in the user model's pre-save hook, token signing in `../session/jwt`, and password changes in `./profile`.

## Key elements

- **`tokenAdd(user, type, expirationTime?)`** — Core primitive. Generates a 32-hex-char token and `$push`es it onto the user document's `tokens` array. All higher-level flows (reset, delete, verification) funnel through this.
- **`requestAccountDeletion(user, context)`** — Issues a 1-hour `delete` token, composes and queues the confirmation email, and emits an audit event. Token value never escapes the function.
- **`PASSWORD_RESET_TOKEN_TYPE` / `PASSWORD_RESET_TOKEN_TTL_MS`** — Exported constants (`'password'` / `3_600_000`) representing reset-link policy.
- **`requestPasswordReset(email, context)`** — Looks up the user, issues a reset token, queues the email, returns `true`/`false`. Returns `false` (not an error) for unknown addresses to prevent account enumeration.
- **`sessionRevoke(userId, sessionId, context)`** — Removes a single session; audits only when `modifiedCount > 0`.
- **`logoutCurrentSession(refreshToken?, context)`** — Revokes the caller's refresh token if present; always emits an audit event (missing cookie is not a failure).
- **`MissingRefreshTokenError`** — Local error class distinguishing "no cookie sent" from "cookie invalid" in audit metadata.
- **`refreshAccessToken(refreshToken?, context)`** — Exchanges a refresh token for a new access token via `createAccessToken`, records the use, and emits audit for all three outcomes (missing, invalid, success).
- **`signup(email, username, password, passwordConfirm, imageUrl, callerContext)`** — Validates via zod (incl. password-match refinement), creates the user, and returns a typed success/reject response.

## Relationships

- **`@infrastructure/adapters/mailer`** — `enqueueEmail` queues the pre-rendered delete-confirmation and reset emails to the mail worker.
- **`../emails`** — `deleteRequestEmail` / `resetRequestEmail` build the localized email template + data *before* the job is published (worker needs no locale).
- **`../session/jwt`** — `createAccessToken` performs the actual refresh→access exchange; `recordRefreshTokenUse` stamps the token's last-use. This file orchestrates; jwt.ts computes.
- **`../audit` / `../analytics`** — Provide the named action/event constants (`accountAuditActions.*`, `accountAnalyticsEvents.*`) consumed by every emit in this file.
- **`@infrastructure/observability/audit`** — `emitAuditEvent` / `buildAuditEvent` are the transport for every audit record here.
- **`@infrastructure/http/response`** — `generateSuccess`, `generateReject`, `validationErrors` shape the HTTP-facing return values (used by `signup`).
- **`@infrastructure/http/request`** — `CallerContext` is threaded into every function that emits audit/analytics.
- **`@infrastructure/http/errors`** — `rejectDatabaseEnvelope` imported for database-failure response construction.
- **`@infrastructure/i18n`** — `t()` for validation error messages; `getDefaultLocale` as the final fallback in locale resolution.
- **`./verification`** — Sibling service; handles verification tokens and states its own type/TTL pair using the same convention.

## Notes

- **Token array concurrency:** `tokenAdd` delegates to the document method because it must `$push`, not reassign. Rebuilding the array (`user.tokens = [...]`) causes a mongoose write that can silently erase tokens added by a concurrent request (two sessions + a reset link are routinely in flight simultaneously).
- **Token values are file-local:** `requestAccountDeletion` and `requestPasswordReset` both keep the raw token inside the function and pass it only into the email composer. No caller ever sees the credential.
- **Silent 200 for unknown emails:** `requestPasswordReset` is shaped so the caller can return 200 unconditionally; the boolean return is for the caller's *metric*, not for a client-facing distinction.
- **Audit is conditional vs. unconditional by design:** `sessionRevoke` audits only on actual modification; `logoutCurrentSession` always audits (missing cookie is a valid end-state). `requestPasswordReset` does *not* audit — the controller does, unconditionally.
- **Locale chain:** `user.locale → context.locale → getDefaultLocale()`. Emails are fully rendered before `enqueueEmail`, so the mail worker never needs a locale.
- **`MissingRefreshTokenError` is not exported.** It exists solely so the single `.catch` in `refreshAccessToken` can set `metadata.reason` to `'missing_token'` vs. `'invalid_token'`.
