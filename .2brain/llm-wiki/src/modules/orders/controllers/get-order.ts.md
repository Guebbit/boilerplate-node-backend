---
source: src/modules/orders/controllers/get-order.ts
sha256: 03555e002775ece89d263c78f905f6a4b8d8049d09ca5a5933ed5817532fa350
generated_at: 2026-11-08T06:46:07.248833+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/controllers/get-order.ts

## Purpose

Handles `GET /orders/:id` — fetches a single order for the authenticated caller and returns a permission-aware view. It exists to isolate the read path (validation → scoped fetch → audit → ETag → response) from the shared response formatter and the order service, keeping the route handler thin.

## Key elements

- **`getOrderItem(request, response)`** — The sole export. Validates the path id, fetches the order via `orderService.getForCaller`, records a staff-read audit entry, sets an ETag, and delegates body construction to `respondWithOrder`. Returns early (or catches) on any failure.

## Relationships

- **`src/modules/orders/services/index.ts`** — Calls `orderService.getForCaller(id, authContext)`; the service applies role scoping (non-admins only see their own orders).
- **`src/modules/orders/controllers/respond.ts`** — Calls `respondWithOrder(response, order, authContext, 'getOrderItem')` to build the JSON body, including the set of actions this caller is permitted to perform.
- **`src/modules/orders/routes.ts`** — Registers `getOrderItem` as the handler for the `GET /orders/:id` route.
- **`src/infrastructure/http/ids.ts`** — Uses `requireId` to validate the path parameter; a malformed id short-circuits to a 404 before any DB query.
- **`src/infrastructure/http/response.ts`** — Uses `rejectResponse` to emit the 404 body when the order is not found or the id is invalid.
- **`src/infrastructure/http/preconditions.ts`** — Calls `setEtag(response, order)` so the client can send `If-Match` on subsequent edits.
- **`src/infrastructure/http/controller.ts`** — Wraps the `.catch` in `catchAs(response, 'getOrderItem')` for uniform error serialization.
- **`src/infrastructure/i18n/index.ts`** — Uses `t('orders.not-found')` for the i18n'd 404 message.
- **`src/kernel/staff-read.ts`** — Calls `recordStaffRead` to log the view as an audit event.
- **`src/modules/orders/audit.ts`** — Imports `ordersAuditActions.ADMIN_ORDER_VIEWED` as the audit action token.
- **`src/modules/orders/domain/index.ts`** — Uses `buyerIdOf(order)` to resolve the owning buyer for the audit record.

## Notes

- A **malformed** `:id` and an **unknown** `:id` intentionally produce the *same* 404 response (`orders.not-found`). This is a deliberate security choice: do not reveal whether an id format is valid.
- The ETag set here is the value the client must echo back as `If-Match` when editing; it is derived from `order` (see `setEtag` implementation for the exact field).
- The response body is **permission-aware**: `respondWithOrder` receives `authContext` and includes only the actions this caller may take, so the UI never relies on a local copy of the lifecycle rules.
- `getForCaller` returning `null` (as opposed to throwing) is the "not found / not yours" signal; it is handled inline, not via the `.catch` path.
