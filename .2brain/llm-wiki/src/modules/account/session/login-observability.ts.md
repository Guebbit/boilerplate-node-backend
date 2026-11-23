---
source: src/modules/account/session/login-observability.ts
source_sha256: 97e3854aa1953a7ce771e5300fdea3a1d787eb40ecb1e71c2e97f47fb0ead298
context_sha256: 6e4ea5192e6c32a92ff1515cb97f7cb0f2aa8808c470846d2b6ef53ea071ad92
generated_at: 2026-11-22T03:48:16.116502+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/session/login-observability.ts

## Purpose
Shared "a login completed" observability tail: metrics, audit and (on success) analytics. It was extracted from `post-login.ts` so the second step of a 2FA login (`post-login-2fa.ts`) reuses the same logic. It lives at the controller/session layer rather than in the login service because the success emit must fire only after a session actually exists (cookies, access token). The credential and code checks in the service layer know nothing about that.

## Key elements
- `attemptedIdentity(email)` (private): returns `pseudonymise('log', normalizeEmail(email))` when `email` is a string, otherwise `undefined`. Normalising first stops a spray attack hiding behind letter case. The `log` purpose makes the digest correlate with the hashed address in stdout log lines without storing the address.
- `recordLoginFailure(request)`: reads `request.body.email` (untyped input, narrowed by a cast) and increments `authLoginTotal` with `status: 'failure'`. It also records an `AUTH_LOGIN` audit entry with `outcome: 'failure'` and the actor set to `'anonymous'`. When an email string was present, the entry carries `targetType: 'login_identifier'` and the pseudonymised `targetId`.
- `recordLoginSuccess(request, userId, metadata?)`: returns a `Promise<void>`.
  - It fetches `isUnrestrictedCaller(userId)` and `accountUserService.findAuthenticatableById(userId)` in parallel. The role is `'admin'` if unrestricted, otherwise `'user'`. It is read fresh from the membership because the account document carries no role.
  - It increments `authLoginTotal` with `status: 'success'`.
  - It records an `AUTH_LOGIN` audit entry with `outcome: 'success'`, the actor's role, and optional `metadata`. Callers pass this for details such as `{ via: 'google' }`.
  - It emits the `USER_LOGGED_IN` analytics event with `distinctId` set to `userId` and `properties: { role }`.

## Relationships
- **Callers:** `src/modules/account/controllers/post-login.ts`, `src/modules/account/controllers/post-login-2fa.ts`, `src/modules/account/controllers/post-login-restore.ts` and `src/modules/account/controllers/get-oauth-callback.ts` are the login controllers in the graph. By the file's own docs, `post-login.ts` and `post-login-2fa.ts` use this module and the OAuth callback passes `metadata`. The file does not show how the other callers use it.
- `src/infrastructure/http/request.ts`: `callerContextOf(request)` builds the context for both audit and analytics.
- `src/infrastructure/observability/audit.ts`: `recordAudit` writes the audit entries.
- `src/infrastructure/observability/analytics/index.ts`: `emitAnalyticsEvent` and `buildAnalyticsBase` build and send the analytics event.
- `src/infrastructure/security/pseudonymise.ts` and `src/infrastructure/persistence/normalize-email.ts`: used together to produce the attempted-identity digest.
- `src/modules/account/audit.ts`, `src/modules/account/analytics.ts` and `src/modules/account/metrics.ts`: provide the `AUTH_LOGIN` audit action, the `USER_LOGGED_IN` analytics event and the `authLoginTotal` counter.
- `src/modules/account/roles.ts`: `isUnrestrictedCaller` decides the admin or user role.
- `src/modules/users/friends/account.ts`: provides `accountUserService`, whose `findAuthenticatableById` supplies the stored analytics consent.

## Notes
- Failure audits use the placeholder actor `'anonymous'`. The raw email is never stored, only its keyed digest.
- The analytics consent is `user?.analyticsConsent ?? context.analyticsConsent`. The account's stored answer wins over the banner header (GDPR Art. 7(3)). The header applies only if the account never answered, because a login route carries no token.
- `recordLoginSuccess` must be called only after the session exists.
