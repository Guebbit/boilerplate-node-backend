---
source: src/modules/account/session/login-observability.ts
sha256: 1bf8144c01a2f1cef22ec9307d3cd517d2bd48a0cc0b5eac005a71ba74aeae2f
generated_at: 2026-09-23T18:11:51.177252+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/login-observability.ts

## Purpose

Centralises the metrics / audit / analytics emissions that fire after a login has fully completed. Extracted from `post-login.ts` so that `post-login-2fa.ts` (the second step of a 2FA flow) can reuse the same "a login happened" signal without duplicating it. It lives at the controller/session layer — not in `services/authentication.ts` — because the success emit must only fire once a session actually exists (cookies, access token set), which is a controller-layer fact that credential-verification functions like `login()` / `verifyLoginChallenge()` cannot know.

## Key elements

- **`recordLoginFailure(request: Request): void`** — Increments the `authLoginTotal` counter with `status: 'failure'` and writes an audit record (`AUTH_LOGIN`, actor `anonymous`, outcome `failure`).
- **`recordLoginSuccess(request: Request, userId: string, requireUnrestricted: boolean, metadata?: Record<string, unknown>): void`** — Increments `authLoginTotal` with `status: 'success'`, writes an audit record (actor = `userId`, role derived from `requireUnrestricted`), and emits a `USER_LOGGED_IN` analytics event with the resolved role. The optional `metadata` object (e.g. `{ via: 'google' }`) is spread into the audit record when present.

## Relationships

- **`src/modules/account/controllers/post-login.ts`** and **`post-login-2fa.ts`** — Primary callers. Both delegate their post-credential-check observability to the two functions here rather than inlining the logic.
- **`src/modules/account/controllers/get-oauth-callback.ts`** — Calls `recordLoginSuccess` with an OAuth-specific `metadata` payload (e.g. provider name).
- **`src/modules/account/metrics.ts`** — Source of the `authLoginTotal` Prometheus counter incremented on both paths.
- **`src/modules/account/audit.ts`** — Provides the `accountAuditActions.AUTH_LOGIN` action constant used in both audit records.
- **`src/modules/account/analytics.ts`** — Provides the `accountAnalyticsEvents.USER_LOGGED_IN` event name for the analytics emission.
- **`src/infrastructure/observability/audit.ts`** — Low-level `recordAudit` writer.
- **`src/infrastructure/observability/analytics/index.ts`** — `emitAnalyticsEvent` / `buildAnalyticsBase` used to dispatch the success analytics event.
- **`src/infrastructure/http/request.ts`** — `callerContextOf(request)` extracts IP/user-agent context for audit and analytics payloads.

## Notes

- The `role` field is **derived**, not looked up: `requireUnrestricted ? 'admin' : 'user'`. Callers must pass the correct flag; this module does not verify it independently.
- `metadata` is optional and only appears in the **audit** record, not in the analytics event. If you need provider info in analytics, it is not currently plumbed.
- Failure recording has **no** analytics emission — only metrics + audit. This is intentional (anonymised actor) but asymmetric with the success path.
- The module is explicitly a `@module` (no default export, no side effects on import).
