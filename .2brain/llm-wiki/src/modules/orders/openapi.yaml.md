---
source: src/modules/orders/openapi.yaml
source_sha256: 53a160c3ad4c162bbdb1a1009a746f93c8e4af99388588739d362519a6b063a5
context_sha256: d7b9a2237254ce2396fc8eba518724030f66be216062df268e8ae4b1d1837271
generated_at: 2026-11-22T06:16:29.027368+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/openapi.yaml

## Purpose
OpenAPI 3.1 contract for the `orders` module. It declares the module's HTTP operations, schemas, parameters and error codes under the `Orders` tag (family `Buying`), covering placing, reading and managing orders and their lifecycle. Shared pieces (pagination, `Email`, `Unauthorized`, `ValidationError`, etc.) are referenced from a shared root contract, `shared/contracts/openapi.root.yaml`.

## Key elements
- **`tags`**: a single tag, `Orders` (`x-family: Buying`).
- **`x-error-codes`** (top-level): module error catalog mapping each code to an HTTP status and description. Codes include:
  - Stock and products: `ORDER_INSUFFICIENT_STOCK` (409), `ORDER_PRODUCT_UNAVAILABLE` (409).
  - Limits and export: `ORDER_LINE_LIMIT_EXCEEDED` (422), `ORDER_EXPORT_TOO_LARGE` (422).
  - Lifecycle and deletion: `ORDER_NOT_CANCELABLE`, `ORDER_NOT_CANCELED`, `ORDER_NOT_DELETED`, `ORDER_HAS_MONEY_HISTORY`, `ORDER_INVOICED` (all 409).
  - Admin override: `ORDER_OVERRIDE_NOT_ALLOWED`, `ORDER_OVERRIDE_AWAITING_STOCK` (409).
  - Addresses: `ORDER_ADDRESS_LOCKED`, `ORDER_BILLING_LOCKED` (409), `ORDER_SHIP_TO_COUNTRY_NOT_SUPPORTED` (422).
- **`x-personal-data`**: contributes an `orders` section (array of `ExportOrder`) and an `orderTimeline` section (array of `OrderTimelineExportEntry`) to the `POST /account/export` response. The bundler adds them to `AccountExportResponse`.
- **`GET /orders`** (`listOrders`, `bearerAuth`, `x-cache: private-no-cache`): paginated list.
  - Filters: `sort` (JSON:API style, e.g. `-price,title`), id, `userId`, `productId`, `email`, order number, `status`, `fulfillmentStatus` (includes the filter-only `awaiting_shipment`), `paymentMethod`, `deleted`, `createdFrom/To`, `paidFrom/To`, `paymentStatus`, `returnStatus`.
  - A caller with only `read:Order` sees their own orders and the `userId` filter is ignored. `display:Order` reads all and may filter by `userId`.
- **`POST /orders`** (`createOrder`, requires `create:Order`): creates an order for `userId`, or a walk-in order when `userId` is absent. It takes an `Idempotency-Key` header and returns `201` with a `Location` header.
  - Staff may sell hidden or off-sale products. Only removed (soft-deleted) products are refused.
  - The schema caps a body at 1000 lines and 999999 units per line. A deployment may set lower limits via `NODE_ADMIN_ORDER_MAX_LINES` and `NODE_ADMIN_ORDER_MAX_LINE_QUANTITY`.
  - Per-operation `x-error-codes` lists `IDEMPOTENCY_IN_FLIGHT`, `ORDER_INSUFFICIENT_STOCK` and `ORDER_PRODUCT_UNAVAILABLE` for 409, and `IDEMPOTENCY_KEY_MISMATCH` and `ORDER_LINE_LIMIT_EXCEEDED` for 422.
  - `/orders` also carries `x-versioned: [post]`, so the bundler adds `ETag` and `Content-Location` to its 2xx answers.
- **`GET /orders/export`**: CSV export of orders using the list's filters. The visible content ends partway through this operation.
- **Referenced local components**: `OrderSort`, `OrderStatus`, `OrderFulfillmentFilter`, `OrderPaymentStatus`, `OrderReturnStatus`, `PaymentMethodId`, `OrdersResponse`, `CreateOrderRequest`, `Order`, `ExportOrder`, `OrderTimelineExportEntry`, and the parameters `UserIdParam`, `ProductIdParam` and `OrderNumberParam`.

## Relationships
- The graph neighbors `asyncapi.domain-events.yaml` and `authorization.yaml` are not referenced in the visible part of this file.
- The permission names that appear in it (`read:Order`, `display:Order`, `create:Order`, `read:StockLevel`, `reap:orders`) are the kind of thing an authorization file would define, but that link is not shown here.

## Notes
- The `x-*` extensions (`x-error-codes`, `x-personal-data`, `x-versioned`, `x-cache`, `x-family`) are read by a bundler and are not standard OpenAPI. Comments say the bundler merges `x-personal-data` into `AccountExportResponse`, and that removing the module removes its export section.
- `ORDER_INSUFFICIENT_STOCK` includes `available` in `errors[].details.lines` only for callers with `read:StockLevel`.
- `x-personal-data.orderTimeline` includes staff reasons. An `actor` appears only when it is the account itself. Which staff member wrote a row stays in the audit log.
- A product the caller may not read answers `404` on order creation, as an unknown id does, so an order never widens what the caller reads.
- The comment above `/orders/export` ("Same as GET /orders, but with JSON body…") does not match the CSV export operation that follows it.
