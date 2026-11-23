---
source: src/modules/returns/controllers/get-return.ts
source_sha256: 5c4236b59a019e6c68df90e4b84b4885c9c20ec0095d71ebcaf52c1ffc8e966f
context_sha256: 0fc6c1d897e7fd78b4270befaa9f9031eb040c16b5dfe8798487c51203466ec2
generated_at: 2026-11-22T07:21:27.165213+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/controllers/get-return.ts

## Purpose
Express controller for `GET /returns/:id`. It returns a single return along with the caller's `actions`. A return on someone else's order gets the same 404 as a nonexistent one. On success it also records a staff-read audit entry that names the order's buyer as the subject.

## Key elements
- `getReturnById(request, response)`: the only export, the route handler.
  - Validates the `:id` param with `requireId`, using the `returns.not-found` error key. It stops if the id is missing.
  - Takes `request.authContext!`, which the `isAuth` middleware guarantees.
  - Calls `returnService.getReturn(id, authContext)`. If `refused(response, result)` handles the result, the handler stops.
  - Otherwise it loads the order with `orderService.getById(result.data.orderId)`.
  - Calls `recordStaffRead` with key `read:Return`, an audit action of `ADMIN_RETURN_VIEWED`, `targetType: 'return'`, `targetId: id` and `subjectId`. The `subjectId` is `buyerIdOf(order)`, or `undefined` if the order is not found.
  - Sends `successResponse<Return>(response, result.data, 200)`.
  - Any rejection is handled by `catchAs(response, 'getReturnById')`.

## Relationships
- `src/infrastructure/http/controller.ts` supplies `catchAs` for error handling and `refused` for turning refused service results into responses.
- `src/infrastructure/http/ids.ts` supplies `requireId` for param validation.
- `src/infrastructure/http/response.ts` supplies `successResponse`.
- `src/modules/returns/services/index.ts` supplies `returnService`, whose `getReturn` is called with the id and auth context.
- `src/modules/orders/index.ts` supplies `buyerIdOf` and `orderService`, used to resolve the buyer for the audit row. `src/modules/orders/services/index.ts` is a related neighbor in the orders module.
- `src/kernel/staff-read.ts` supplies `recordStaffRead`, which writes the audit record.
- `src/modules/returns/audit.ts` supplies `returnsAuditActions`, the source of the audit action constant.
- `src/types/index.ts` supplies the `Return` type.
- `src/modules/returns/routes.ts` presumably mounts this handler. The file itself does not show that.

## Notes
- The return model has no buyer field on purpose. The buyer is resolved from the order only to fill the audit row's `subjectId`, and it is not part of the response.
- The audit entry is recorded after the service check passes and before the response is sent. It is recorded even when the order lookup returns nothing, in which case `subjectId` is `undefined`.
- The handler does not `return` on the `requireId` or `refused` early exits beyond stopping. Response writing is delegated to those helpers.
