---
source: src/modules/returns/controllers/get-return.ts
sha256: 0e3bb8547f3c78ba14adb123f1cd0e1acfee4a818084559fa413556a7e865da1
generated_at: 2026-11-14T21:32:42.154445+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/controllers/get-return.ts

## Purpose

Controller for `GET /returns/:id`. Resolves a single return for the authenticated caller, records a staff-read audit event, and returns the return payload. A return belonging to another buyer is indistinguishable from a missing one (both yield 404).

## Key elements

- **`getReturnById`** (exported) — The sole handler. Validates the `:id` param, fetches the return via `returnService.getReturn`, resolves the associated order to obtain the buyer ID, records the audit row, and sends a `200` response with the `Return` object.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Imports `catchAs` (error → HTTP mapping) and `refused` (short-circuits when the service returns a refusal instead of data).
- **`src/infrastructure/http/ids.ts`** — Imports `requireId` to extract and validate the route param, short-circuiting with a 404 if absent.
- **`src/infrastructure/http/response.ts`** — Imports `successResponse` to serialize the final 200 body.
- **`src/kernel/staff-read.ts`** — Calls `recordStaffRead` to persist an audit row keyed `read:Return` with action `ADMIN_RETURN_VIEWED`.
- **`src/modules/orders/index.ts`** — Imports `buyerIdOf` and `orderService`; the latter is used to look up the parent order so the buyer ID can be attached to the audit event.
- **`src/modules/returns/services/index.ts`** — Imports `returnService`; delegates the actual fetch + authorization to `getReturn`.
- **`src/modules/returns/audit.ts`** — Imports `returnsAuditActions` to supply the enum value (`ADMIN_RETURN_VIEWED`) used in the audit record.
- **`src/modules/returns/routes.ts`** — Registers this handler on the `GET /returns/:id` route (not imported here, but this file is its target).
- **`src/types/index.ts`** — Imports the `Return` type for the response generic.

## Notes

- **404 over 403**: Cross-buyer access is deliberately indistinguishable from a missing return; the service layer (`returnService.getReturn`) is responsible for enforcing ownership, and the controller treats any refusal as a 404 via `refused`.
- **Buyer is not on the Return model**: The return entity intentionally omits the buyer. The controller resolves it from the parent order *solely* for the `subjectId` field on the audit row. The returned payload does not include it.
- **Auth context via non-null assertion**: `request.authContext!` is safe only because the route is guarded by an `isAuth` middleware; there is no runtime guard in this function.
- **No pagination or list logic**: This is strictly a single-entity fetch; the list endpoint lives elsewhere.
