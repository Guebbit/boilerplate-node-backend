---
source: src/modules/returns/controllers/get-return-by-id.ts
sha256: e7959ff4eb4ebcf3bfeb698a5cccb4cde2f148b5d4f6d939bd86d291969b37d5
generated_at: 2026-10-15T11:51:08.313599+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/controllers/get-return-by-id.ts

## Purpose

Handles `GET /returns/:id`. Retrieves a single return for the authenticated caller, attaching the caller's available `actions`. A return on another user's order is indistinguishable from a nonexistent one (both return 404) to avoid leaking existence.

## Key elements

- **`getReturnById(request, response)`** — The sole export. Validates the `:id` param, delegates to `returnService.getReturn(id, authContext)`, records a staff-read audit entry on success, and sends a 200 with the `Return` payload.

## Relationships

- **`@infrastructure/http/controller`** — Provides `catchAs` (uniform error → HTTP mapping in the `.catch` branch) and `refused` (converts a service-level refusal into an appropriate HTTP error response).
- **`@infrastructure/http/ids`** — `requireId` extracts and validates the `:id` route param, short-circuiting with a 404 if missing.
- **`@infrastructure/http/response`** — `successResponse` serialises the 200 body.
- **`@kernel/staff-read`** — `recordStaffRead` logs an audit event (key `returns.any.read`) after a successful fetch.
- **`@modules/returns/audit`** — Supplies the `returnsAuditActions.ADMIN_RETURN_VIEWED` action constant used in the audit record.
- **`@modules/returns/services`** — `returnService.getReturn` performs the actual lookup and authorization check.
- **`@modules/returns/routes`** — Wires this handler onto the `GET /returns/:id` route.
- **`@types`** — Source of the `Return` type used in the response generic.

## Notes

- Auth context (`request.authContext`) is assumed present; the `isAuth` middleware guarantees it upstream. The non-null assertion is safe by contract, not by runtime check.
- The 404-for-other-users pattern is intentional: it prevents an attacker from probing whether a given return ID exists on another order.
- The audit log fires *after* the service call succeeds but *before* the HTTP response is sent; if `successResponse` throws, the audit entry has already been recorded.
