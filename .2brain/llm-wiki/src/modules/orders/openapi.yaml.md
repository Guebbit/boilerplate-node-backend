---
source: src/modules/orders/openapi.yaml
sha256: fd701dda5d119c7dbcf31bdcbdcccf1c7c30c22fc4c7ac6007fb744265253610
generated_at: 2026-09-27T15:12:00.834625+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/openapi.yaml

## Purpose

OpenAPI 3.0.3 contract (v2.0.0) for the Orders module. It declares every public HTTP endpoint the module exposes—list, create, search, read, replace, patch, delete, and restore—along with their request/response schemas, so that clients, codegen tooling, and the shared contract library have a single source of truth for the API surface.

## Key elements

- **`listOrders`** (`GET /orders`) – Paginated order listing with filters (userId, productId, email, status, paymentMethod, notes, deleted). Non-admin callers are auto-scoped to their own orders.
- **`searchOrders`** (`POST /orders/search`) – JSON-body variant of `listOrders`; annotated `x-alias-of: listOrders`. Intended for DTO-driven / multi-language codegen.
- **`createOrder`** (`POST /orders`) – Creates an order. Supports `Idempotency-Key` header (409 if in-flight, 422 if body mismatch). Response links reference `createPaymentIntent` (payments) and `cancelOrderById`.
- **`deleteOrder`** (`DELETE /orders`) – Soft or hard delete; `hardDelete` flag readable from query *or* body. Annotated `x-alias-of: deleteOrderById` (the `{id}`-path variant lives elsewhere in the same spec).
- **`getOrderById`** (`GET /orders/{id}`) – Full order detail; equivalent to `GET /orders?id=…`.
- **`replaceOrderById`** (`PUT /orders/{id}`) – RFC 9110 full-replace. Only `email` is writable; `status` changes exclusively via dedicated action endpoints (`/cancel`, `/status-override`).
- **`patch`** (`PATCH /orders/{id}`) – Partial merge (section truncated in source).
- **Shared schemas** – `OrdersResponseEnvelope`, `OrderEnvelope`, `CreateOrderRequest`, `DeleteOrderRequest`, `SearchOrdersRequest`, `ReplaceOrderByIdRequest` (defined under `#/components/schemas`).
- **Shared parameters & responses** – Referenced from `shared/contracts/openapi.root.yaml` (paging, auth, error envelopes).

## Relationships

- **`src/modules/orders/module.yaml`** – The module manifest that registers this OpenAPI document; the spec is the contract surface that manifest points to for codegen and gateway routing.
- **`src/modules/payments/module.ts`** – The `createOrder` response includes an OpenAPI *Link* to the `createPaymentIntent` operation and a *Link* to `cancelOrderById`, tying the order lifecycle directly into the payments module's API.
- **`src/modules/observability/openapi.yaml`** – Sibling module contract in the same repo; shares the same `shared/contracts/openapi.root.yaml` definitions (auth scheme, common error responses) but has no direct `$ref` into this file.

## Notes

- `x-alias-of` annotations (`deleteOrder → deleteOrderById`, `searchOrders → listOrders`) indicate that a single controller serves multiple route shapes; treat the aliased operation as the canonical one when reasoning about behavior.
- The `hardDelete` flag is *OR*-semantics across query and body: a `true` from any source wins.
- `status` is intentionally **not** a writable field on `PUT`/`PATCH` bodies; it transitions only through dedicated action endpoints (see `docs/theory/tactical-ddd.md#who-writes-the-status`).
- Soft-delete is one-way; undo is via `POST /orders/{id}/restore` (not shown in the truncated portion but referenced in the `deleteOrder` description).
- All endpoints require `bearerAuth`; non-admin callers are transparently scoped, so the `userId` filter parameter is effectively ignored for them.
