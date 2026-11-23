---
source: src/modules/orders/controllers/get-order.ts
source_sha256: 535a5f7abd74de385ec97285deffef80811a89f6bc616f53041912c76855c9b7
context_sha256: c62bb5e1b008362b5bb0c14b106e266dea8836b6d3b1f38ae110f8cd10370d1c
generated_at: 2026-11-22T06:08:39.692416+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/controllers/get-order.ts

## Purpose
Express controller for `GET /orders/:id`. It returns a single order, scoped by caller role (non-admin callers see only their own). A malformed id is rejected before any query and gives the same 404 as an unknown id.

## Key elements
- `getOrderItem(request, response)`: the only export. It returns `Promise<void> | void`.
  1. Validates the path id with `requireId`, using the `orders.not-found` message. It returns early if the id is invalid.
  2. Calls `orderService.getForCaller(id, request.authContext)`.
  3. If no order comes back, it sends a 404 through `rejectResponse` with the translated `orders.not-found` message.
  4. Otherwise it calls `recordStaffRead` with an `ADMIN_ORDER_VIEWED` audit entry (`key: 'display:Order'`, `targetType: 'order'`, `targetId: id`, `subjectId` set to the order's buyer id).
  5. It then replies through `respondWithOrder`.
  6. Any rejection is passed to `catchAs(response, 'getOrderItem')`.

## Relationships
- `src/modules/orders/services/index.ts` (`orderService`): `getForCaller` does the role-scoped lookup.
- `src/infrastructure/http/ids.ts` (`requireId`): validates the id before the query.
- `src/infrastructure/http/response.ts` (`rejectResponse`): builds the 404 response.
- `src/infrastructure/http/controller.ts` (`catchAs`): the error handler for the promise chain.
- `src/infrastructure/i18n/index.ts` (`t`): translates the not-found message.
- `src/kernel/staff-read.ts` (`recordStaffRead`): records the staff read for auditing.
- `src/modules/orders/audit.ts` (`ordersAuditActions`): supplies the `ADMIN_ORDER_VIEWED` action constant.
- `src/modules/orders/domain/index.ts` (`buyerIdOf`): extracts the buyer id used as the audit subject.
- `src/modules/orders/controllers/respond.ts` (`respondWithOrder`): writes the successful response.
- Not imported in this file: `src/modules/orders/routes.ts` is presumably where the handler is mounted. `src/modules/orders/domain/rules.ts` and `src/infrastructure/i18n/context.ts` are graph neighbors with no visible interaction here.

## Notes
- `respondWithOrder` stamps the order's version, which an edit sends back as `If-Match`. The response body carries what this caller may do to the order, so the client renders its controls from the server's answer rather than from its own copy of the lifecycle.
- The id check happens before the query, so a malformed id and an unknown id are indistinguishable to the client.
- `recordStaffRead` is called for every successful read. This file does not check the caller's role itself, and whether non-staff reads are recorded is decided inside `recordStaffRead`.
