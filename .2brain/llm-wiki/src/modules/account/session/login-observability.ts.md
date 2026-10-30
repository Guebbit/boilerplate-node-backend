---
source: src/modules/account/session/login-observability.ts
sha256: e4aef5e81b71697ec73f347d0b7b9211f5ef19c2cb59688829b63f8edc545787
generated_at: 2026-10-29T02:49:50.607123+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/login-observability.ts

## Purpose

Extracts the post-login observability tail (Prometheus counter, audit record, analytics event) so that both `post-login.ts` and `post-login-2fa.ts` share one definition of "a login completed." It lives at the controller/session layer rather than in `services/login.ts` because the SUCCESS emit must only fire after a session (cookies, access token) actually exists — a fact credential-checking services do not know.

## Key elements

- **`attemptedIdentity(email)`** *(private)* — Normalises then pseudonymises an email string (purpose `'log'`) so the resulting hash correlates with stdout log lines without storing the address. Returns `undefined` for non-string input.
- **`recordLoginFailure(request)`** — Increments the `authLoginTotal` failure counter and writes an audit entry (actor = `anonymous`, outcome = `failure`, optional `targetId` from the body's `email`).
- **`recordLoginSuccess(request, userId, metadata?)`** — Increments the success counter, writes an audit entry with the resolved role and any caller-supplied metadata (e.g. `{ via: 'google' }`), and emits a `USER_LOGGED_IN` analytics event. Resolves the role via `isUnrestrictedCaller` and fetches the user document to honour stored analytics consent.

## Relationships

- **`@infrastructure/http/request`** — `callerContextOf(request)` provides IP, user-agent, and the banner consent header used by both audit and analytics paths.
- **`@infrastructure/observability/audit`** — `recordAudit` is the single write path for the structured audit log.
- **`@infrastructure/observability/analytics`** — `buildAnalyticsBase` + `emitAnalyticsEvent` compose and dispatch the analytics payload.
- **`@infrastructure/persistence/normalize-email`** — Normalises case/whitespace before pseudonymisation so `Foo@Bar.com` and `foo@bar.com` produce the same digest.
- **`@infrastructure/security/pseudonymise`** — One-way hash keyed by purpose (`'log'`) so the value is correlation-safe in logs.
- **`@modules/account/audit`** — Supplies the `AUTH_LOGIN` action constant.
- **`@modules/account/analytics`** — Supplies the `USER_LOGGED_IN` event-name constant.
- **`@modules/account/metrics`** — Supplies the `authLoginTotal` Prometheus counter.
- **`@modules/account/roles`** — `isUnrestrictedCaller` determines whether the signed-in user maps to `admin` or `user`.
- **`@modules/users`** — `userService.findAuthenticatableById` fetches the account to read its `analyticsConsent` field.
- **`post-login.ts` / `post-login-2fa.ts` / `get-oauth-callback.ts` / `post-login-restore.ts`** — Controller-level callers that invoke `recordLoginSuccess` (with route-specific `metadata`) or `recordLoginFailure`.

## Notes

- Analytics consent resolution is deliberately **stored value first, banner header second** (GDPR Art. 7(3)): the account's explicit yes/no overrides the request header; the header is only a fallback for accounts that never answered.
- The role in the audit/analytics payload is computed at emit time from `isUnrestrictedCaller`, not read from a field on the account document — the account document carries no role of its own.
- `recordLoginFailure` intentionally records the actor as `anonymous`; the body's email (if present) is only a correlation target, never an asserted identity.
- The `metadata` parameter on `recordLoginSuccess` is the extension point for route-specific context (e.g. OAuth provider) without this file needing to know which login flow called it.
