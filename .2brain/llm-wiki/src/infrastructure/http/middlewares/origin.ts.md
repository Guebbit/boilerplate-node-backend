---
source: src/infrastructure/http/middlewares/origin.ts
source_sha256: 28d800fee72b98858bf0d5164eb5c024b7d70812053b24dec0952d2233192411
context_sha256: e34101f96418233802ea3a9b8436187a7854c1fb97fd6180f5713ef3c1176af2
generated_at: 2026-11-22T02:51:11.691076+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/http/middlewares/origin.ts

## Purpose
An Express middleware that guards endpoints a cookie alone authenticates (refresh, logout, the SSE stream) against CSRF. If a request carries an `Origin` header that is not on the frontend's allowlist, it is refused with 403 and an audit record is written. Requests with no `Origin` (curl, health checks, same-origin navigations) pass through, matching the CORS middleware's behavior.

## Key elements
- `requireAllowedOrigin(request, response, next)`: the only export.
  - Reads `Origin` with `request.get('Origin')`.
  - Calls `next()` if the header is absent or `isAllowedOrigin(origin)` is true.
  - Otherwise it calls `recordAudit` with `coreAuditActions.SECURITY_FORBIDDEN`, actor `'anonymous'`, outcome `'failure'`. The metadata holds `reason: 'foreign_origin'`, the origin truncated to 200 chars, the route path and the method.
  - It then answers via `rejectResponse(response, 403, [t('generic.error-forbidden')])`.

## Relationships
- `../origins` (`src/infrastructure/http/origins.ts`): supplies `isAllowedOrigin`, the allowlist check.
- `src/infrastructure/http/response.ts`: `rejectResponse` builds the 403 reply.
- `src/infrastructure/http/request.ts`: `callerContextOf(request)` supplies the context passed to `recordAudit`.
- `src/infrastructure/i18n/index.ts`: `t` translates the message used in the 403 reply.
- `src/infrastructure/observability/audit.ts`: provides `recordAudit` and `coreAuditActions`.
- `tests/unit/infrastructure/http/middlewares/origin.test.ts`: unit tests for this middleware.
- `src/modules/account/routes.ts`, `src/modules/notifications/routes.ts` and `src/modules/observability/routes.ts` are neighbors in the dependency graph. They presumably mount this middleware on the cookie-authenticated routes, but that isn't visible in this file.

## Notes
- The `Origin` value is attacker-controlled, so it is truncated to 200 characters before being logged.
- The audit entry cites ASVS 5.0 V16.3.2.
- This check complements CORS rather than replacing it. CORS stops a foreign page from reading the response, and this middleware stops the request from acting at all.
- A missing `Origin` is allowed by design, so the check only protects against browser-initiated cross-origin requests.
