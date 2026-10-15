---
source: src/modules/account/session/login-observability.ts
sha256: d11e2bb91ed458d3d68d52d5ea9874c795e335521b2b9947aefda5975b17e8b3
generated_at: 2026-10-15T10:08:09.177779+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/login-observability.ts

## Purpose

Fires the metrics, audit, and analytics signals for a completed (successful or failed) login. Extracted from `post-login.ts` so that `post-login-2fa.ts` reuses the same "a login happened" tail without re-implementing it. Lives at the controller/session layer — not in `services/login.ts` — because the success emit is only valid once a session actually exists (cookies, access token), which is a controller-layer fact.

## Key elements

- **`attemptedIdentity`** (private) – Normalises and pseudonymises an email string (purpose `'log'`) for use as an audit `targetId`; returns `undefined` for non-string input.
- **`recordLoginFailure(request: Request): void`** – Increments the `authLoginTotal` failure counter and writes an audit record with `actorUserId: 'anonymous'`. Synchronous.
- **`recordLoginSuccess(request: Request, userId: string, metadata?: Record<string, unknown>): Promise<void>`** – Resolves the caller's role via `isUnrestrictedCaller`, increments the success counter, writes an audit record (with optional `metadata` for e.g. OAuth `via`), and emits a `USER_LOGGED_IN` analytics event.

## Relationships

- **`post-login.ts` / `post-login-2fa.ts` / `get-oauth-callback.ts`** (controllers) – Call `recordLoginFailure` / `recordLoginSuccess`; this file is their shared observability tail.
- **`src/infrastructure/observability/audit.ts`** – `recordAudit` writes every audit line produced here.
- **`src/infrastructure/observability/analytics/index.ts`** – `emitAnalyticsEvent` + `buildAnalyticsBase` power the success analytics emission.
- **`src/infrastructure/http/request.ts`** – `callerContextOf` extracts IP/user-agent context from the Express `Request` for both audit and analytics payloads.
- **`src/infrastructure/security/pseudonymise.ts`** + **`src/infrastructure/persistence/normalize-email.ts`** – Combined in `attemptedIdentity` to produce a safe, case-insensitive identifier for audit.
- **`src/modules/account/audit.ts`** – Supplies the `accountAuditActions.AUTH_LOGIN` action constant.
- **`src/modules/account/analytics.ts`** – Supplies the `accountAnalyticsEvents.USER_LOGGED_IN` event name.
- **`src/modules/account/metrics.ts`** – Supplies the `authLoginTotal` counter.
- **`src/modules/account/roles.ts`** – `isUnrestrictedCaller` determines whether the logged-in user is an admin for the audit/analytics role field.

## Notes

- `recordLoginSuccess` is **async** (returns `Promise<void>`) solely because role resolution via `isUnrestrictedCaller` is asynchronous; callers must `await` it.
- `recordLoginFailure` is synchronous.
- The `pseudonymise('log', …)` purpose tag is deliberate: it makes the audit `targetId` correlate with the same hashed value in stdout log lines, without persisting the raw email.
- `recordLoginSuccess`'s `metadata` param is the intended extension point for login-method-specific detail (e.g. `{ via: 'google' }` from the OAuth callback controller); omit it for plain password logins.
