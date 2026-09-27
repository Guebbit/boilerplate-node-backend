---
source: src/modules/account/session/login-observability.ts
sha256: 029c09033ebf06bf039bdf6e3d97aaaf228bf5df1d95bb5f82734fe38e10b7af
generated_at: 2026-09-27T14:32:31.093207+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/login-observability.ts

## Purpose

Centralises the metrics, audit, and analytics emissions that fire when a login completes (success or failure). Extracted from `post-login.ts` so the 2FA second-step controller (`post-login-2fa.ts`) can reuse the same "a login happened" signal without duplicating it. Lives at the session/controller layer deliberately — the success path must only fire after cookies and an access token exist, which is a controller-layer fact invisible to `login()`/`verifyLoginChallenge()` in services.

## Key elements

- **`recordLoginFailure(request)`** — Increments the `authLoginTotal` metric with `status: 'failure'` and writes an audit entry (actor `anonymous`, outcome `failure`).
- **`recordLoginSuccess(request, userId, requireUnrestricted, metadata?)`** — Increments `authLoginTotal` with `status: 'success'`, writes an audit entry (actor = real user id, role derived from `requireUnrestricted`), and emits a `USER_LOGGED_IN` analytics event. The optional `metadata` bag lets callers attach context such as `{ via: 'google' }` for OAuth logins.

## Relationships

- **`src/modules/account/controllers/post-login.ts`** — Primary consumer; calls `recordLoginFailure` on credential rejection and `recordLoginSuccess` on a successful password login.
- **`src/modules/account/controllers/post-login-2fa.ts`** — Reuses `recordLoginSuccess` for the second (challenge-verification) step so the event is emitted once, not twice.
- **`src/modules/account/controllers/get-oauth-callback.ts`** — Calls `recordLoginSuccess` with a `metadata` object identifying the OAuth provider (e.g. `{ via: 'google' }`).
- **`src/modules/account/metrics.ts`** — Provides the `authLoginTotal` counter.
- **`src/modules/account/audit.ts`** — Provides the `accountAuditActions.AUTH_LOGIN` action constant.
- **`src/modules/account/analytics.ts`** — Provides the `accountAnalyticsEvents.USER_LOGGED_IN` event name.
- **`src/infrastructure/observability/audit.ts`** — Supplies `recordAudit`.
- **`src/infrastructure/observability/analytics/index.ts`** — Supplies `emitAnalyticsEvent` and `buildAnalyticsBase`.
- **`src/infrastructure/http/request.ts`** — Supplies `callerContextOf` for extracting IP/user-agent context from the Express request.

## Notes

- **Placement is intentional, not incidental.** The module docblock explicitly states the success emission must not live in `services/authentication.ts` because credential/code verification alone does not guarantee a session exists. Do not move the functions down to the service layer.
- **`requireUnrestricted` → role.** The boolean is mapped to `'admin'` vs `'user'` for the audit and analytics `role` property; there is no separate role enum here.
- **`metadata` is optional and spread into the audit record.** It is omitted entirely (not set to `{}`) when the caller passes `undefined`, keeping the audit payload clean for plain password logins.
- **`actor_user_id` on failure is the literal string `'anonymous'`**, not `null` or `undefined`, so audit queries can filter on a non-null value.
