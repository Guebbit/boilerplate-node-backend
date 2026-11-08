---
source: src/modules/account/session/login-observability.ts
sha256: e4aef5e81b71697ec73f347d0b7b9211f5ef19c2cb59688829b63f8edc545787
generated_at: 2026-11-08T04:29:36.538657+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/login-observability.ts

## Purpose

Shared observability tail (metrics, audit, analytics) that fires when a login completes—successfully or not. Extracted from `post-login.ts` so the 2FA follow-up controller (`post-login-2fa.ts`) can reuse the same "a login happened" signals without re-implementing them. Lives at the controller/session layer (not in `services/login.ts`) because the success emit must only fire after a session actually exists (cookies, access token), a fact the credential-checking services don't know about.

## Key elements

- **`attemptedIdentity`** (private) — Normalises a candidate email string, then pseudonymises it with purpose `'log'` so it correlates with the hashed address in stdout logs without storing the raw address. Returns `undefined` for non-string input.
- **`recordLoginFailure(request)`** — Increments the `authLoginTotal{status='failure'}` metric and writes an audit record (actor = `anonymous`, action = `AUTH_LOGIN`, outcome = `failure`, optional `targetId` from the attempted email).
- **`recordLoginSuccess(request, userId, metadata?)`** — Increments `authLoginTotal{status='success'}`, writes an audit record with the resolved role and any caller-supplied metadata (e.g. `{ via: 'google' }`), and emits a `USER_LOGGED_IN` analytics event. Role is resolved at call time via `isUnrestrictedCaller`.

## Relationships

- **`@infrastructure/http/request`** — `callerContextOf(request)` extracts IP/UA/consent-header context for both audit and analytics payloads.
- **`@infrastructure/observability/audit`** — `recordAudit` is the single write path for audit entries.
- **`@infrastructure/observability/analytics`** — `emitAnalyticsEvent` / `buildAnalyticsBase` drive the analytics emission.
- **`@infrastructure/persistence/normalize-email`** & **`@infrastructure/security/pseudonymise`** — Used together inside `attemptedIdentity` to produce a correlation-safe, non-reversible digest of the attempted identifier.
- **`@modules/account/metrics`** — Source of the `authLoginTotal` Prometheus counter.
- **`@modules/account/audit`** — Source of the `accountAuditActions.AUTH_LOGIN` action constant.
- **`@modules/account/analytics`** — Source of the `accountAnalyticsEvents.USER_LOGGED_IN` event constant.
- **`@modules/account/roles`** — `isUnrestrictedCaller(userId)` determines whether the actor role is `admin` or `user`.
- **`@modules/users`** — `userService.findAuthenticatableById(userId)` fetches the user's stored `analyticsConsent` for the analytics event.
- **`post-login.ts` / `post-login-2fa.ts` / `post-login-restore.ts` / `get-oauth-callback.ts`** — The controllers that invoke `recordLoginSuccess` or `recordLoginFailure` as the final step after a session is established.

## Notes

- `recordLoginSuccess` resolves the role *fresh* from the membership table (`isUnrestrictedCaller`); the account document itself carries no role.
- Analytics consent precedence: the user's stored `analyticsConsent` (yes/no) overrides the request's banner header. The header is only used when the account has never explicitly answered (GDPR Art. 7(3)).
- `recordLoginFailure` hard-codes `actorUserId: 'anonymous'` and `actorRole: 'anonymous'`; it never attempts to resolve a user from the (failed) credential.
- The module is intentionally *not* imported by any service-layer file; it is a controller-adjacent concern.
