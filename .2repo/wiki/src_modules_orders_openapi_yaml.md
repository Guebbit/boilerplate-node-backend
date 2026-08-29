# src/modules/orders/openapi.yaml

## Purpose

OpenAPI 3.0.3 contract for the Orders module. It defines every HTTP endpoint the module exposes (list, search, create, read, update, delete), their request/response shapes, security requirements, and the error vocabulary clients must handle. It exists so that both human consumers and codegen tooling have a single authoritative source for the order API surface.

## Key elements

- **`listOrders`** (`GET /orders`) — Paginated order list. Accepts shared pagination/filter params plus `email`, `status`, `notes` filters. Non-admin callers are auto-scoped to their own orders.
- **`searchOrders`** (`POST /orders/search`) — Functionally equivalent to `listOrders` but takes a JSON body (`SearchOrdersRequest`) for DTO-friendly multi-language codegen. Annotated `x-alias-of: listOrders`.
- **`createOrder`** (`POST /orders`) — Creates an order from a `CreateOrderRequest` body. Returns 201 with `OrderEnvelope`.
- **`updateOrder`** (`PUT /orders`) — Updates by `id` in the body. Annotated `x-alias-of: updateOrderById`. Returns 409 with three distinct `errors[].code` values for lifecycle violations.
- **`updateOrderById`** (`PUT /orders/{id}`) — Same operation, `id` in the path. Shares the identical 409 semantics.
- **`deleteOrder`** (`DELETE /orders`) — Deletes by `id` in the body; `hardDelete` flag readable from both query and body (any `true` wins). Annotated `x-alias-of: deleteOrderById`.
- **`getOrderById`** (`GET /orders/{id}`) — Fetches a single order; equivalent to `GET /orders?id={id}`.
- **Local schemas** (`#/components/schemas/…`) — `OrdersResponseEnvelope`, `OrderEnvelope`, `CreateOrderRequest`, `UpdateOrderRequest`, `UpdateOrderByIdRequest`, `DeleteOrderRequest`, `SearchOrdersRequest`.
- **Security** — All operations require `bearerAuth`.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — Heavy $ref consumer. Pulls in shared parameters (`PageParam`, `PageSizeParam`, `IdParam`, `UserIdParam`, `ProductIdParam`, `HardDeleteParam`, `IdPathParam`), schemas (`Email`, `OrderStatus`), and the standard error-response components (`Unauthorized`, `Forbidden`, `NotFound`, `ValidationError`, `Conflict`, `InternalError`, `Success`). Changing any of those shared definitions ripples into every orders endpoint.

## Notes

- **`x-alias-of` annotation** — `PUT /orders` → `updateOrderById`, `POST /orders/search` → `listOrders`, `DELETE /orders` → `deleteOrderById`. The aliases exist for codegen ergonomics; a single controller serves both forms.
- **`hardDelete` precedence** — The flag may appear in the query string *and* the JSON body simultaneously. A `true` from any source is final; a `false` elsewhere does not cancel it.
- **409 on update is polymorphic** — Three distinct rejections share status 409 and are disambiguated only by `errors[].code`:
  - `ORDER_TRANSITION_NOT_ALLOWED` — illegal lifecycle move; `errors[].details` carries `{ from, to, allowed }`.
  - `ORDER_CANCEL_VIA_CANCEL_ENDPOINT` — `cancelled` is not a field; use `POST /orders/{id}/cancel`.
  - `ORDER_ITEMS_HELD` — `items` cannot be rewritten while stock is held/sold.
- **`paid` is not client-writable** — Only a confirmed payment (see payments module) transitions an order to `paid`; any attempt via this spec's update endpoint will 409.
- **`userId` filter is advisory for admins only** — Non-admin callers are force-scoped server-side; sending `userId` has no effect.
