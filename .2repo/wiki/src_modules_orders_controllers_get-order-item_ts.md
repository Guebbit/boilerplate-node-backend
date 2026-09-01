# src/modules/orders/controllers/get-order-item.ts

## Purpose

Single-order read controller for `GET /orders/:id`. It scopes the result by caller role (admin sees any order; non-admins only their own) and attaches the set of actions the current caller is allowed to perform, so the client can render its controls from the server's answer rather than duplicating lifecycle logic.

## Key elements

- **`getOrderItem(request, response)`** — the sole export. Validates the path-param `id` up front, delegates the fetch to `orderService.getById` with a caller scope, maps a missing order to 404, and on success returns the order wrapped through `orderService.withActions` so the payload includes role-specific permitted actions.

## Relationships

- **`../service` (`orderService`)** — provides `getById`, `callerScope`, and `withActions`; all data access and role logic lives there.
- **`@infrastructure/http/response`** — `successResponse` / `rejectResponse` shape the JSON envelope and status codes.
- **`@infrastructure/http/request`** — `isValidObjectId` performs the pre-query id validation.
- **`@infrastructure/http/controller`** — `catchAs` is the standard `.catch` handler for unhandled errors.
- **`@infrastructure/i18n`** — `t` supplies the user-facing "not found" message.
- **`../routes`** — registers this handler for the `GET /orders/:id` path.

## Notes

- **Why the id check is pre-query, not post-query:** Other single-item reads let a malformed id produce a driver `CastError` (422) and map it in `.catch`. Here, the admin branch (`findById`) and the scoped branch (aggregate) throw *different* error classes for the same bad id. Validating first guarantees a uniform 404 regardless of caller role.
- The function is promise-based (`.then`/`.catch`), consistent with the rest of the orders module, rather than `async`/`await`.
- The response body is **not** the raw order document; it is `orderService.withActions(order, authContext)`, which adds a permissions/actions field the UI consumes directly.
