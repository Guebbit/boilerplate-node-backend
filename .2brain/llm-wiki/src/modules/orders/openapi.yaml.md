---
source: src/modules/orders/openapi.yaml
sha256: 97313252ff51e4312d1cf2383c6c1285e8fc0ae728195a5d79e05e1316d10dc0
generated_at: 2026-10-15T11:05:24.312947+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/openapi.yaml

## Purpose

OpenAPI 3.1.0 contract for the orders module. It declares the module's full HTTP surface (paths, parameters, request/response schemas), domain-specific error codes, and its contribution to the account personal-data export. It is the single source of truth that clients, docs generators, and the build-time bundler consume to know what the orders API exposes.

## Key elements

- **`tags`** – Registers the `Orders` tag under which all operations in this file are grouped.
- **`x-error-codes`** – Custom extension enumerating eight domain error codes (`ORDER_INSUFFICIENT_STOCK`, `ORDER_EXPORT_TOO_LARGE`, `ORDER_INVOICED`, `ORDER_LINE_LIMIT_EXCEEDED`, `ORDER_NOT_CANCELLABLE`, `ORDER_NOT_CANCELLED`, `ORDER_OVERRIDE_NOT_ALLOWED`, `ORDER_OVERRIDE_AWAITING_STOCK`), each with its HTTP status and a human-readable description of when it fires.
- **`x-personal-data`** – Custom extension declaring two arrays (`orders`, `orderTimeline`) that the bundler merges into `AccountExportResponse` for `POST /account/export`. Removing this module removes its export section.
- **`GET /orders`** (`listOrders`) – Paginated list with ~15 filter parameters (status, fulfillment, payment method, deleted flag, date ranges, user/product id). Visibility is scoped by `orders.self.read` vs `orders.any.read`.
- **`POST /orders`** (`createOrder`) – Creates an order for the `userId` in the body. Bounded by schema caps (1000 lines × 999999 units) and optional deployment limits (`NODE_ADMIN_ORDER_MAX_LINES`, `NODE_ADMIN_ORDER_MAX_LINE_QUANTITY`). Supports `Idempotency-Key`. Response links to `createPaymentIntent` and `cancelOrderById`.
- **`DELETE /orders`** (`deleteOrder`) – Soft or hard delete identified by `id` in the body. `hardDelete=true` is only allowed for a cancelled, never-paid order. Carries `x-alias-of: deleteOrderById`, indicating one controller serves both this route and the `{id}` form.
- **Shared-contract `$ref`s** – Reusable parameters, schemas, and error responses are pulled from `../../../shared/contracts/openapi.root.yaml`.

## Relationships

- **`src/modules/orders/module.yaml`** – The module's manifest/configuration; this OpenAPI file is the API contract it registers. The two together define what the orders module exposes.
- **`src/modules/payments/module.ts`** – The `createOrder` response includes an OpenAPI `links` entry (`PayOrder`) whose target is the `createPaymentIntent` operation in the payments module, wiring the "pay a new order" flow across modules at the contract level.
- **`src/modules/observability/openapi.yaml`** – Sibling module contract. Both contribute `x-personal-data` sections that the bundler assembles into a single `AccountExportResponse`; they are independent but co-located in the same bundling step.

## Notes

- Two non-standard extensions (`x-error-codes`, `x-personal-data`) carry semantics the OpenAPI spec itself cannot express. Tooling and the bundler must understand both.
- `DELETE /orders` and the (truncated) `DELETE /orders/{id}` are the **same controller**; the `x-alias-of` annotation and the `hardDelete` parameter being readable from query, body, and path on whichever route it is mounted on are intentional, not a duplicate.
- The `sort` query parameter on `GET /orders` uses JSON:API grammar (comma-separated, leading `-` for descending), not the more common `sort=field,dir` style.
- The file is **truncated** in this excerpt; additional paths (e.g. `/orders/{id}`, `/orders/{id}/cancel`, `/orders/{id}/restore`) and component schemas exist beyond what is shown here.
