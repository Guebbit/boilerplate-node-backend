---
source: src/infrastructure/http/middlewares/origin.ts
sha256: 7eecb1c4f6b5d0e321c0789d229d268770b4aa384cdf78af37565095aea7a347
generated_at: 2026-10-15T09:50:03.915890+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/middlewares/origin.ts

## Purpose

CSRF-guard middleware for endpoints authenticated by a cookie alone (refresh, logout, SSE stream). It rejects any request whose `Origin` header names a value outside the allowed origins, blocking cross-origin form/`fetch` submissions that a malicious page could fire with the victim's cookie. Requests with no `Origin` header (curl, health checks, same-origin navigations) pass through unchanged.

## Key elements

- **`requireAllowedOrigin`** (exported Express middleware) – Reads the `Origin` header. If absent or in the allowlist, calls `next()`. Otherwise, records a security audit event and returns **403** with an i18n-ized error body.
- **Audit recording on rejection** – Logs `coreAuditActions.SECURITY_FORBIDDEN` with the foreign origin (capped at 200 chars), route, and method; actor is always `'anonymous'`.
- **Allowlist check** – Delegates to `isAllowedOrigin` from `../origins`.

## Relationships

- **`src/infrastructure/http/origins.ts`** — source of the `isAllowedOrigin` predicate; the single source of truth for which origins are trusted.
- **`src/infrastructure/http/request.ts`** — provides `callerContextOf`, used to populate the audit record with caller identity fields.
- **`src/infrastructure/http/response.ts`** — provides `rejectResponse`, the standard 4xx/5xx responder.
- **`src/infrastructure/i18n/index.ts`** — provides `t`, the translation function used for the 403 error message.
- **`src/infrastructure/observability/audit.ts`** — provides `recordAudit` and `coreAuditActions` for the security-event trail.
- **`src/kernel/middlewares/authorizations.ts`** — the middleware registry that mounts `requireAllowedOrigin` onto cookie-authenticated routes.
- **`src/modules/account/routes.ts`** / **`src/modules/notifications/routes.ts`** — consumer routes (refresh, logout, SSE) that depend on this guard.
- **`tests/unit/infrastructure/http/middlewares/origin.test.ts`** — unit tests covering allowed, foreign, and absent-Origin paths.

## Notes

- The middleware is intentionally **not** applied to every route — only to endpoints where a cookie is the sole credential and no custom anti-CSRF token is feasible (SSE streams, for example, can't carry a per-request token).
- The `Origin` value stored in audit metadata is sliced to 200 characters because the header is attacker-controllable; do not remove the cap without a length-bound elsewhere.
- A request with **no** `Origin` header is treated as non-browser traffic and allowed through. This is by design (mirrors the CORS middleware's behavior) but means a crafted non-browser request that omits the header will also pass this guard.
