---
source: src/infrastructure/http/middlewares/origin.ts
sha256: 7eecb1c4f6b5d0e321c0789d229d268770b4aa384cdf78af37565095aea7a347
generated_at: 2026-11-08T03:31:46.952389+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/middlewares/origin.ts

## Purpose

CSRF guard for cookie-authenticated endpoints (refresh, logout, SSE stream). It rejects any request whose `Origin` header names a value outside the allowed frontend origins, complementing CORS by preventing the action itself rather than merely hiding the response from the attacker's page.

## Key elements

- **`requireAllowedOrigin(request, response, next)`** — The sole export. Reads the `Origin` header; if absent or allowed, calls `next()`. Otherwise records a `SECURITY_FORBIDDEN` audit event and returns a 403 via `rejectResponse`.
- **Origin allowlist check** — Delegated to `isAllowedOrigin` from `../origins`; this file does not hold the list itself.
- **Audit trail** — On rejection, calls `recordAudit` with `callerContextOf(request)`, the origin (capped at 200 chars), route path, and method. Actor is recorded as `'anonymous'` since the request is by definition untrusted.

## Relationships

- **`src/infrastructure/http/origins.ts`** — Provides `isAllowedOrigin`, the actual allowlist predicate.
- **`src/infrastructure/http/response.ts`** — Provides `rejectResponse` used to emit the 403.
- **`src/infrastructure/http/request.ts`** — Provides `callerContextOf` for the audit record.
- **`src/infrastructure/i18n/index.ts` / `context.ts`** — Provides `t` to translate the generic "forbidden" error message.
- **`src/infrastructure/observability/audit.ts`** — Provides `recordAudit` and `coreAuditActions.SECURITY_FORBIDDEN`.
- **`src/kernel/middlewares/authorizations.ts`** — Registers / composes this middleware onto the relevant routes.
- **`src/modules/account/routes.ts`** — Endpoints (refresh, logout) that this middleware guards.
- **`src/modules/notifications/routes.ts`** — SSE stream endpoint that this middleware guards.
- **`tests/unit/infrastructure/http/middlewares/origin.test.ts`** — Unit tests covering allow, deny, and no-origin cases.

## Notes

- A missing `Origin` header is treated as legitimate (curl, health checks, same-origin navigation) and passes through — same convention as the CORS middleware.
- The `Origin` header value in the audit metadata is truncated to 200 characters because the attacker controls that header.
- This middleware is intentionally narrow: it only applies to cookie-only-auth endpoints. Endpoints that also use bearer tokens do not need this check.
