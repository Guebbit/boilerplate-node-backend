---
source: src/modules/account/session/login-observability.ts
sha256: 7a06860abad37cce9d3ae40c0cbbddc04ee8ec73d072cb88606200c5bd80bff4
generated_at: 2026-10-14T09:01:40.577149+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/login-observability.ts

## Purpose

Shared observability tail (metrics + audit + analytics) fired when a login attempt completes. Extracted from `post-login.ts` so that `post-login-2fa.ts` can reuse the same "a login happened" signal without re-implementing it. Deliberately lives in the controller/session layer rather than `services/login.ts` because the success emit must fire only after a session actually exists (cookies, access token)—a fact only the controllers can confirm.

## Key elements

- **`attemptedIdentity`** (private helper) — Normalises an email string (`trim` → `toLowerCase`) and passes it through `pseudonymise('log', …)`. Returns `undefined` for non-string inputs. Used solely in failure-path audit records.
- **`recordLoginFailure(request)`** — Increments the `authLoginTotal` counter with `status: 'failure'` and writes an audit record with actor `anonymous` and, when present, a pseudonymised `targetId`.
- **`recordLoginSuccess(request, userId, requireUnrestricted, metadata?)`** — Increments `authLoginTotal` with `status: 'success'`, writes an audit record (role derived from `requireUnrestricted`, optional `metadata` e.g. `{ via: 'google' }`), and emits a `USER_LOGGED_IN` analytics event.

## Relationships

- **`src/modules/account/controllers/post-login.ts`** — Original owner of this logic; now calls `recordLoginFailure` / `recordLoginSuccess`.
- **`src/modules/account/controllers/post-login-2fa.ts`** — Second step of a 2FA login; imports and reuses both functions so the success signal fires exactly once.
- **`src/modules/account/controllers/get-oauth-callback.ts`** — Calls `recordLoginSuccess` with channel-specific `metadata` (e.g. `{ via: 'google' }`).
- **`src/modules/account/audit.ts`** — Provides the `accountAuditActions.AUTH_LOGIN` enum used in audit records.
- **`src/modules/account/analytics.ts`** — Provides the `accountAnalyticsEvents.USER_LOGGED_IN` event name.
- **`src/modules/account/metrics.ts`** — Provides the `authLoginTotal` Prometheus counter.
- **`src/infrastructure/http/request.ts`** — Supplies `callerContextOf(request)` for audit/analytics context.
- **`src/infrastructure/observability/audit.ts`** — `recordAudit` sink.
- **`src/infrastructure/observability/analytics/index.ts`** — `emitAnalyticsEvent` / `buildAnalyticsBase` sinks.
- **`src/infrastructure/security/pseudonymise.ts`** — Hashes the attempted email for correlation without storing it.

## Notes

- The `log` purpose passed to `pseudonymise` is specifically for correlating with hashed addresses in stdout log lines; it is not a storage hash.
- `attemptedIdentity` normalises case *before* hashing so that `Admin@x.com` and `admin@x.com` produce the same digest—without this, a case-spray hides behind the hash.
- `requireUnrestricted` is a boolean that maps to the `'admin'` / `'user'` role string in both the audit record and the analytics event properties; the file does not define what "unrestricted" means beyond that mapping.
- The `metadata` parameter on `recordLoginSuccess` is intentionally optional and untyped (`Record<string, unknown>`) to keep the function generic across login channels (password, 2FA, OAuth).
