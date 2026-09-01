# src/modules/account/services/authentication.ts

## Purpose

Implements the two token writes that every account flow depends on—issuing (`tokenAdd`) and revoking (`sessionRemove` / `tokenRemoveByValue`)—plus the user-facing endpoints built on them: signup, login, password reset, account-deletion request, session logout, and token refresh. Credential *values* (hashing, JWT signing, password change) are deliberately excluded; they live on the model hook, `../session/jwt`, and `./profile` respectively.

## Key elements

- **`tokenAdd(user, type, expirationTime?)`** – Generates a 32-hex-char token and delegates to the user document's own `tokenAdd` method (a `$push`). The single write-path for all token issuance.
- **`requestAccountDeletion(user, context)`** – Issues a 1-hour `delete` token, queues the confirmation email, and emits an audit event. Token value never leaves this function.
- **`PASSWORD_RESET_TOKEN_TYPE`** (`'password'`) / **`PASSWORD_RESET_TOKEN_TTL_MS`** (`3_600_000`) – Policy constants shared by reset and setup flows.
- **`requestPasswordReset(email, context)`** – Looks up the user by email, issues a reset token, queues the email, returns `boolean` (true = mail queued). Always resolves; the caller always answers 200 to prevent address enumeration.
- **`requestAccountSetup(user)`** – Same token mechanics as reset, different email copy. Called from the `users` module's admin-creation event; no `CallerContext` so no audit here.
- **`sessionRevoke(userId, sessionId, context)`** – Removes one session by id. Audits only when `modifiedCount > 0`.
- **`logoutCurrentSession(refreshToken?, context)`** – Revokes the caller's refresh token if present, always emits audit + analytics. A missing cookie is not an error.
- **`refreshAccessToken(refreshToken?, context)`** – Exchanges a refresh token for a new access token (via `createAccessToken`), records the use, and distinguishes `missing_token` from `invalid_token` in audit metadata.
- **`MissingRefreshTokenError`** – Internal sentinel so the single `.catch` can tell "no cookie" apart from "bad token" without branching the happy path.
- **`signup(email, username, password, passwordConfirm, imageUrl?, thumbnailUrl?, pendingImageKey?, callerContext)`** – Validates input (zod), hashes password with bcrypt, creates the user, sends verification email, emits audit + analytics. *(Implementation truncated in source.)*

## Relationships

- **`@infrastructure/adapters/mailer`** – `enqueueEmail` publishes all outbound emails (reset, delete, setup) as finished templates; the worker needs no further locale resolution.
- **`@infrastructure/http/response`** – `generateSuccess` / `generateReject` / `validationErrors` shape the HTTP envelopes returned by `signup` and error paths.
- **`@infrastructure/http/errors`** – `rejectDatabaseEnvelope` wraps Mongoose `CastError` into a standard 400 response.
- **`@infrastructure/http/request`** – `CallerContext` (locale, actor id, role) is threaded into every audit/analytics call.
- **`@infrastructure/i18n`** – `t`, `getCurrentLocale`, `getDefaultLocale` drive email copy and user-facing validation messages.
- **`@infrastructure/observability/audit`** – `emitAuditEvent` / `buildAuditEvent` record every security-relevant action (login, logout, token refresh, deletion request, session revoke).
- **`@infrastructure/observability/analytics`** – `emitAnalyticsEvent` / `buildAnalyticsBase` feed product analytics (e.g. `USER_LOGGED_OUT`).
- **`../analytics`** – `accountAnalyticsEvents` provides the canonical event-name constants.
- **`../audit`** – `accountAuditActions` provides the canonical action-name constants.
- **`../emails`** – `deleteRequestEmail`, `resetRequestEmail`, `setupRequestEmail` render locale-resolved email templates with the token embedded.
- **`../session/jwt`** – `createAccessToken` and `recordRefreshTokenUse` handle the actual JWT work; this file orchestrates *when* they run and what to audit around them.
- **`../verification`** – Sibling service; shares the `tokenAdd` pattern and its own token-type/TTL constants for email verification.
- **`./index`** – Barrel that re-exports this file's public API to the module router.
- **`../module`** – Wires the exported handlers into the account HTTP module.

## Notes

- **Token values are file-local.** `requestAccountDeletion`, `requestPasswordReset`, and `requestAccountSetup` all consume the token inside their `.then` chain; no caller ever receives it. This prevents a live credential from leaking into a layer that shouldn't hold one.
- **Array append, never rebuild.** `tokenAdd` delegates to the document method so the write is a `$push`. Replacing the array (`user.tokens = [...]`) would erase tokens added by a concurrent request in the same time window—exactly what happens when a reset link and a second session race.
- **Silence is a security feature.** `requestPasswordReset` resolves `false` for unknown addresses and the route always returns 200, so the endpoint cannot be used for email enumeration.
- **Locale fallback order** is consistent: `user.locale` → `context.locale` → `getDefaultLocale()`. The email is rendered *before* enqueue, so the mailer worker needs no locale.
- **`refreshAccessToken`** is the only route where the session itself is the requester (login *creates* a session; refresh *uses* one), which is why `recordRefreshTokenUse` is called here and nowhere else.
- **Logout never fails.** A missing refresh cookie is a no-op, not an error; the audit event still fires so the trail shows the user *attempted* logout.
