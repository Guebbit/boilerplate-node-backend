---
source: src/modules/returns/controllers/get-return-by-id.ts
sha256: 9c5f2ab25ea9431728c8aef893f3f883b6ac9ba7c2976e3df22bc9a6cccdc4c9
generated_at: 2026-10-29T05:35:53.958989+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/controllers/get-return-by-id.ts

## Purpose

Express route handler for `GET /returns/:id`. Resolves a single return by ID, enforces ownership (a return belonging to another user's order returns **404**, indistinguishable from a missing one), records a staff-read audit event, and replies with the return payload plus the caller's available `actions`.

## Key elements

- **`getReturnById(request, response)`** — the sole export. Validates the `:id` path param, calls `returnService.getReturn(id, authContext)`, then either short-circuits on a refusal, records the audit, and sends `successResponse<Return>(…, 200)`, or delegates to `catchAs`.

## Relationships

- **`@infrastructure/http/controller`** — `catchAs` is the error handler passed to `.catch()`; `refused` checks the service result for an authorization-denied shape and writes the appropriate 4xx.
- **`@infrastructure/http/ids`** — `requireId` extracts and validates the `:id` param, sending a 404 with the `returns.not-found` message if missing.
- **`@infrastructure/http/response`** — `successResponse` formats the 200 body.
- **`@kernel/staff-read`** — `recordStaffRead` logs an audit entry keyed `read:Return` after a successful read.
- **`@modules/returns/audit`** — supplies `returnsAuditActions.ADMIN_RETURN_VIEWED`, the action constant recorded in the audit log.
- **`@modules/returns/services/index`** — `returnService.getReturn` is the business-logic call that performs ownership check and data fetch.
- **`@modules/returns/routes`** — registers `getReturnById` as the handler for `GET /returns/:id`.
- **`@types/index`** — imports the `Return` interface used in the success response generic.

## Notes

- The non-null assertion on `request.authContext!` is safe only because the `isAuth` middleware runs before this handler; no runtime guard exists here.
- Returning 404 (not 403) for someone else's return is an intentional anti-enumeration choice documented in the file's doc comment.
- The promise chain uses `.then().catch()` rather than `async/await`, matching the module's broader controller convention.
