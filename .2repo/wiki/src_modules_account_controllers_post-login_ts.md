# src/modules/account/controllers/post-login.ts

## Purpose
Controller handler for `POST /account/login`. Authenticates the user's credentials, issues a long-lived refresh cookie and a short-lived access token, and records login observability (metric, audit log, analytics event) for both success and failure paths.

## Key elements
- **`postLogin`** (exported) — The Express handler. Reads `email`/`password` from the body without schema validation, optionally validates the `remember` tier, runs `runTokenCleanup()`, calls `accountService.login()`, then on success creates a refresh token, sets cookies, derives an access token, and responds. On failure or unexpected error, records observability and returns an error response.
- **`recordLoginFailure(request)`** — Increments `authLoginTotal{status:'failure'}` and emits an anonymous audit event.
- **`recordLoginSuccess(request, userId, isAdmin)`** — Increments `authLoginTotal{status:'success'}`, emits a user-attributed audit event, and fires an analytics event (`USER_LOGGED_IN`).
- **`rememberSchema`** — Zod object schema validating the optional `remember` field against the `RefreshTokenExpiryTime` enum.

## Relationships
- **`../services/index.ts`** — Calls `accountService.login(email, password)` for credential verification and `runTokenCleanup()` as a background pre-flight step.
- **`../session/jwt.ts`** — Calls `createRefreshToken(userId, remember)` and `createAccessToken(refreshToken)` to build the token pair.
- **`../session/cookies.ts`** — Calls `createRefreshCookie` and `createLoggedCookie` to set the response cookies.
- **`../session/config.ts`** — Imports `RefreshTokenExpiryTime` (enum of valid expiry tiers) for the `remember` schema.
- **`../metrics.ts`** — Imports `authLoginTotal` counter.
- **`../audit.ts`** — Imports `accountAuditActions` (enum of audit action constants).
- **`../analytics.ts`** — Imports `accountAnalyticsEvents` (enum of analytics event names).
- **`@infrastructure/http/response.ts`** — Uses `successResponse` and `rejectResponse` for all terminal responses.
- **`@infrastructure/http/errors.ts`** — Uses `rejectDatabaseError` in the `.catch` path.
- **`@infrastructure/http/controller.ts`** — Uses `rejectValidation` for the `remember` tier 422.
- **`@infrastructure/http/request.ts`** — Uses `callerContextOf(request)` to extract caller metadata for audit/analytics payloads.
- **`@infrastructure/observability/audit.ts`** — Uses `emitAuditEvent` / `buildAuditEvent`.
- **`@infrastructure/observability/analytics/index.ts`** — Uses `emitAnalyticsEvent` / `buildAnalyticsBase`.
- **`routes.ts`** — Mounts `postLogin` on the login route (the consumer of this export).

## Notes
- **No full-body validation is intentional (security).** Parsing `password` with a `min()` rule would let a too-short password return `422` while a wrong-but-valid-length password returns `401`, leaking information about the secret. It would also skip `recordLoginFailure`, so the audit trail would miss the attempt. The only credential check is the hash comparison inside the service.
- **`remember` is validated separately** because it is not a secret (a 422 reveals nothing about credentials) and an unknown tier must not slip through to produce a cookie with no lifetime.
- **Observability lives in the controller, not the service, by design.** The success emit fires only after the refresh token, cookies, *and* access token are all created. Placing it in `accountService.login` would fire it one step early, reporting a session that might still fail to establish. The failure emit stays here for symmetry.
- **The `.catch` block does NOT call `recordLoginFailure`.** A crash in token creation or cookie setting is a server error, not a rejected login — the caller may have had correct credentials. It is handled by `rejectDatabaseError` only.
