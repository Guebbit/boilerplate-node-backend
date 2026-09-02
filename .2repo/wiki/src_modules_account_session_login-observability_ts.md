# src/modules/account/session/login-observability.ts

## Purpose

Shared observability tail (metrics, audit, analytics) that fires at the end of a completed login. Extracted from `post-login.ts` so `post-login-2fa.ts` reuses it rather than re-implementing "a login happened." Deliberately lives at the controller/session layer, not in the authentication service, because the success emit must only fire after a session actually exists (cookies, access token)—a controller-layer fact.

## Key elements

- **`recordLoginFailure(request)`** — Increments the `authLoginTotal` metric with `status: 'failure'` and emits an audit event (`AUTH_LOGIN`, actor `'anonymous'`, outcome `'failure'`). No analytics event.
- **`recordLoginSuccess(request, userId, isAdmin)`** — Increments `authLoginTotal` with `status: 'success'`, emits an audit event (real `userId`, role `'admin'` or `'user'`, outcome `'success'`), and emits a `USER_LOGGED_IN` analytics event with the role as a property.

## Relationships

- **`src/infrastructure/http/request.ts`** — Calls `callerContextOf(request)` to build the audit/analytics caller context from the Express request.
- **`src/infrastructure/observability/audit.ts`** — Imports `emitAuditEvent` / `buildAuditEvent` for audit emission.
- **`src/infrastructure/observability/analytics/index.ts`** — Imports `emitAnalyticsEvent` / `buildAnalyticsBase` for analytics emission.
- **`src/modules/account/audit.ts`** — Imports `accountAuditActions` (uses `AUTH_LOGIN`).
- **`src/modules/account/analytics.ts`** — Imports `accountAnalyticsEvents` (uses `USER_LOGGED_IN`).
- **`src/modules/account/metrics.ts`** — Imports and increments the `authLoginTotal` counter.
- **`src/modules/account/controllers/post-login.ts`** — Original home of this logic; now a consumer of these helpers.
- **`src/modules/account/controllers/post-login-2fa.ts`** — Second-step 2FA controller; consumes these helpers so the success path is emitted exactly once per completed login.

## Notes

- The failure path emits metrics + audit only; the success path emits all three (metrics, audit, analytics). Do not expect an analytics event on failure.
- On failure, `actor_user_id` and `actor_role` are hardcoded to `'anonymous'`—there is no user to identify.
- The module is intentionally **not** placed in `services/authentication.ts` (`login()` / `verifyLoginChallenge()`) because those functions only validate credentials/codes and have no visibility into whether a session (cookies, access token) was actually established.
