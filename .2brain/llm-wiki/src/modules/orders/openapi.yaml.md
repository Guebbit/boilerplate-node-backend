---
source: src/modules/orders/openapi.yaml
sha256: 0ca6c32b56317e24b48aeea91c20f0883fe159898eb7175b0be5180815cb4b2f
generated_at: 2026-09-23T19:04:44.661565+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/openapi.yaml

## Purpose

OpenAPI 3.0.3 contract (v2.0.0) for the Orders module. It declares the full REST surface—list, create, update, delete, search, and per-id operations—along with local request/response schemas, so that clients, codegen tooling, and the runtime controller share a single source of truth for the module's API.

## Key elements

- **Paths defined:**
    - `GET /orders` – `listOrders`: paginated list; non-admin callers are auto-scoped to their own orders.
    - `POST /orders` – `createOrder`: creates an order; requires `Idempotency-Key` header; 409 if the key is in-flight, 422 if the key was used with a different body.
    - `PUT /orders` – `updateOrder` (alias of `updateOrderById`): id travels in the body; 409 encodes three distinct refusals (illegal transition, cancel-via-wrong-endpoint, items-locked-by-hold).
    - `DELETE /orders` – `deleteOrder` (alias of `deleteOrderById`): `hardDelete` flag readable from **both** query and body; `true` from any source wins.
    - `POST /orders/search` – `searchOrders` (alias of `listOrders`): same logic as `GET /orders` but with a JSON body, intended for DTO / multi-language codegen.
    - `GET /orders/{id}` – `getOrderById`: single-order fetch, equivalent to `GET /orders?id={id}`.
    - `PUT /orders/{id}` – (truncated in source; the per-id update form).

- **Local schemas** (under `#/components/schemas`): `CreateOrderRequest`, `UpdateOrderRequest`, `DeleteOrderRequest`, `SearchOrdersRequest`, `OrderEnvelope`, `OrdersResponseEnvelope`.

- **Shared refs** (all from `../../../shared/contracts/openapi.root.yaml`): standard parameters (`PageParam`, `PageSizeParam`, `IdParam`, `UserIdParam`, `ProductIdParam`, `IdPathParam`, `HardDeleteParam`, `IdempotencyKeyHeader`), standard responses (`Unauthorized`, `Forbidden`, `NotFound`, `ValidationError`, `Conflict`, `InternalError`, `Success`), and shared schemas (`Email`, `OrderStatus`, `PaymentMethodId`).

- **`x-alias-of` annotations:** mark operations that are alternate mount points for the same controller logic (`updateOrder → updateOrderById`, `deleteOrder → deleteOrderById`, `searchOrders → listOrders`).

- **Response links** on `POST /orders → 201`: wire the new order's `id` into `createPaymentIntent` (payments) and `cancelOrderById` (orders) for client-side navigation.

## Relationships

- **`src/modules/orders/module.yaml`** – This OpenAPI file is the contract artifact registered by the Orders module definition; the module wires this spec to its runtime routes.
- **`src/modules/payments/module.ts`** – The `createPaymentIntent` operation referenced in the `POST /orders → 201` response link is served by the Payments module; the link's `parameters.orderId` maps to `$response.body#/data/id` of the created order.
- **`src/modules/observability/openapi.yaml`** – Sibling module contract; no direct `$ref` or operation cross-reference is visible in this file, so the only relationship is co-residence in the monorepo's module contract set.

## Notes

- **`cancelled` is not a writable field.** Attempting to set `status: cancelled` via `PUT /orders` returns 409 with code `ORDER_CANCEL_VIA_CANCEL_ENDPOINT`; the only way to cancel is `POST /orders/{id}/cancel`, which releases held stock and triggers a refund.
- **`items` are immutable while stock is held or sold.** A 409 with code `ORDER_ITEMS_HELD` is returned if you try to rewrite `items` on an order whose reservation has frozen the original lines.
- **409 on `PUT /orders` is polyglot.** Three different business rules share the same HTTP status; clients must branch on `errors[].code` (`ORDER_TRANSITION_NOT_ALLOWED`, `ORDER_CANCEL_VIA_CANCEL_ENDPOINT`, `ORDER_ITEMS_HELD`).
- **`hardDelete` source-of-truth rule:** the flag may appear in the query string _and_ the JSON body simultaneously; if either source sends `true`, the deletion is hard. A `false` elsewhere does not override it.
- **Admin "awaiting transfer" view** is expressed as a query combination: `paymentMethod=<id>&status=pending` on `GET /orders`.
- **Non-admin scoping is server-side and non-overridable:** the `userId` query parameter is silently ignored for non-admin callers regardless of value.
