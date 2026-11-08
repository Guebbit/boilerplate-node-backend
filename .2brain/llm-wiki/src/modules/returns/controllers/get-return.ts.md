---
source: src/modules/returns/controllers/get-return.ts
sha256: 9c5f2ab25ea9431728c8aef893f3f883b6ac9ba7c2976e3df22bc9a6cccdc4c9
generated_at: 2026-11-08T07:55:59.293115+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/controllers/get-return.ts

## Purpose

HTTP handler for `GET /returns/:id`. Retrieves a single return by ID scoped to the authenticated caller's permissions and returns the return document with the caller's available `actions`. Returns a 404 (not 403) when the return belongs to someone else's order, so existence is not leaked.

## Key elements

- **`getReturnById(request, response)`** – The sole export. Validates the `:id` route param, calls `returnService.getReturn(id, authContext)`, records a staff-read audit event, and sends a `200` with the `Return` payload. Errors are delegated to `catchAs`; authorization rejections to `refused`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `@infrastructure/http/controller` | Imports `catchAs` (unified error catch) and `refused` (auth/permission rejection check). |
| `@infrastructure/http/ids` | Imports `requireId` to extract and validate the `:id` param; short-circuits with 404 on failure. |
| `@infrastructure/http/response` | Imports `successResponse` to emit the final JSON `200` response. |
| `@kernel/staff-read` | Calls `recordStaffRead` after a successful fetch to log the audit entry. |
| `@modules/returns/audit` | Imports `returnsAuditActions.ADMIN_RETURN_VIEWED` as the action name for the audit record. |
| `@modules/returns/services` | Imports `returnService.getReturn` — the actual data/authorization logic. |
| `@modules/returns/routes` | Registers this handler on the `GET /returns/:id` route (consumer side). |
| `@types` | Imports the `Return` type used as the response payload shape. |

## Notes

- **404 vs 403 on foreign returns:** The service layer (or `refused`) converts "not yours" into a 404 rather than a 403. Do not "fix" this to a 403 without confirming the intent.
- **`request.authContext!`** – The non-null assertion relies on the `isAuth` middleware having already run. If this handler is ever mounted without that middleware, it will throw at runtime.
- **Audit key is `read:Return`** (capital R), distinct from any `read:return` convention elsewhere. The `targetType` field, however, uses lowercase `'return'`.
