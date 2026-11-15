---
source: src/modules/account/session/login-observability.ts
sha256: da250bb32cfaf265130659e1ed0ec1304906a51fe4b157889d434944c691fa4b
generated_at: 2026-11-14T18:58:33.355570+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/login-observability.ts

## Purpose

The metrics, audit, and analytics "tail" that fires after a completed login. Extracted from `post-login.ts` so that `post-login-2fa.ts` (the second step of a 2FA login) reuses it instead of duplicating what "a login happened" means. It lives at the controller layer — not in `services/login.ts` — because the success signal must only fire once a session actually exists (cookies, access token), a fact the credential-check functions don't know.

## Key elements

- **`attemptedIdentity`** *(internal)* — Pseudonymises a normalised email string (purpose `"log"`) for use as an audit `targetId`, or returns `undefined` if the input isn't a string.
- **`recordLoginFailure(request: Request)`** — Increments `authLoginTotal` with `status: 'failure'` and writes an audit entry (`actorUserId: 'anonymous'`, `outcome: 'failure'`, optional `targetId` from the request body's `email` field).
- **`recordLoginSuccess(request: Request, userId: string, metadata?: Record<string, unknown>)`** — Increments `authLoginTotal` with `status: 'success'`, writes an audit entry (resolving the actor's role via `isUnrestrictedCaller`), and emits a `USER_LOGGED_IN` analytics event. Fetches the user via `accountUserService.findAuthenticatableById` to honour the account's stored `analyticsConsent` over the request-header value.

## Relationships

- **`src/modules/account/roles.ts` (`isUnrestrictedCaller`)** — Called at success time to resolve whether the signed-in account is an admin.
- **`src/modules/account/audit.ts` (`accountAuditActions`)** — Supplies the `AUTH_LOGIN` action constant for both failure and success audit records.
- **`src/modules/account/analytics.ts` (`accountAnalyticsEvents`)** — Supplies the `USER_LOGGED_IN` event name for the analytics emit.
- **`src/modules/account/metrics.ts` (`authLoginTotal`)** — The Prometheus counter incremented on both outcomes.
- **`src/infrastructure/observability/audit.ts` (`recordAudit`)** — Low-level audit writer used by both exported functions.
- **`src/infrastructure/observability/analytics/index.ts` (`emitAnalyticsEvent`, `buildAnalyticsBase`)** — Analytics pipeline; `buildAnalyticsBase` derives the shared event envelope from the request context.
- **`src/infrastructure/security/pseudonymise.ts` (`pseudonymise`)** — Hashes the email for audit correlation without storing the raw value.
- **`src/infrastructure/persistence/normalize-email.ts` (`normalizeEmail`)** — Normalises the email before pseudonymisation so case variants don't produce different digests.
- **`src/infrastructure/http/request.ts` (`callerContextOf`)** — Extracts the caller context (IP, user-agent, analytics-consent header) for audit and analytics records.
- **`src/modules/users/friends/account.ts` (`accountUserService`)** — Looks up the account to read its stored `analyticsConsent`.
- **`src/modules/account/controllers/post-login.ts`** — Original home of this logic before extraction; still a caller.
- **`src/modules/account/controllers/post-login-2fa.ts`** — Reuses these exports for the second step of a 2FA login.
- **`src/modules/account/controllers/post-login-restore.ts`** — Calls the same observability tail for restore-code logins.
- **`src/modules/account/controllers/get-oauth-callback.ts`** — Calls `recordLoginSuccess` with a `metadata` object (such as `{ via: 'google' }`) to distinguish the OAuth path in audit.

## Notes

- The SUCCESS path resolves role **fresh** from membership (`isUnrestrictedCaller`); the account document itself carries no role.
- Analytics consent precedence: the account's stored `analyticsConsent` (yes or no) **always wins** over the request-header value. The header only matters for an account that never answered (GDPR Art. 7(3)).
- `attemptedIdentity` uses pseudonymise purpose `"log"` specifically so the digest correlates with the same value already in stdout log lines, without persisting the raw address.
- `recordLoginFailure` reads `request.body.email` via a narrowing cast; the body is untyped at this layer.
