---
source: src/modules/orders/openapi.yaml
sha256: c1400ef21c3300ebb8d4cc72d9a5deb3f4930a374710579a903da9c6c066f1f6
generated_at: 2026-11-08T06:53:37.901485+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/openapi.yaml

## Purpose

OpenAPI 3.1.0 contract for the **orders** module. It declares the REST surface (list, create, export), the module-specific error-code vocabulary, the account-data-export section this module contributes, and the shared parameter/schema components other order-related specs reuse. It is the single source of truth that codegen tools, clients, and the authorization module consume.

## Key elements

- **`tags`** – One tag, `Orders`, annotated `x-family: Buying`.
- **`x-error-codes`** – ~14 module-specific error codes (`ORDER_INSUFFICIENT_STOCK`, `ORDER_PRODUCT_UNAVAILABLE`, `ORDER_EXPORT_TOO_LARGE`, `ORDER_INVOICED`, `ORDER_LINE_LIMIT_EXCEEDED`, `ORDER_NOT_CANCELABLE`, `ORDER_NOT_CANCELED`, `ORDER_HAS_MONEY_HISTORY`, `ORDER_NOT_DELETED`, `ORDER_OVERRIDE_NOT_ALLOWED`, `ORDER_ADDRESS_LOCKED`, `ORDER_SHIP_TO_COUNTRY_NOT_SUPPORTED`, `ORDER_OVERRIDE_AWAITING_STOCK`) with HTTP status, human description, and details-shape notes.
- **`x-personal-data`** – The `orders` and `orderTimeline` sections the account-data-export endpoint (`POST /account/export`) bundles into `AccountExportResponse`. Schemas: `ExportOrder`, `OrderTimelineExportEntry`.
- **`paths`**
  - `GET /orders` – Paginated list with filters (sort, `userId`, `productId`, `email`, `orderNumber`, `status`, `fulfillmentStatus`, `paymentMethod`, `deleted`, date ranges, `paymentStatus`, `returnStatus`). Requires `read:Order` (self) or `display:Order` (all).
  - `POST /orders` – Creates an order from a payload for a named `userId`. Supports idempotency key. Enforces stock, product-availability, and line-count limits.
  - `GET /orders/export` – Streams a CSV of every matching order. Requires `export:Order` (step-up gated). Excludes encrypted address fields. Capped by `NODE_ORDER_EXPORT_MAX_ROWS`.
- **`components/parameters`** – `UserIdParam`, `ProductIdParam`, `OrderNumberParam` (module-local); page, page-size, id, idempotency-key params are `$ref`'d from `shared/contracts/openapi.root.yaml`.
- **`components/schemas`** – `Order`, `OrdersResponse`, `CreateOrderRequest`, `OrderStatus`, `OrderFulfillmentStatus`, `OrderPaymentStatus`, `OrderReturnStatus`, `PaymentMethodId`, `OrderSort`, `ExportOrder`, `OrderTimelineExportEntry`, and others.

## Relationships

- **`src/modules/orders/module.yaml`** – Declares this file as the module's OpenAPI contract; the module's router, permissions, and lifecycle hooks are all scoped to the operations defined here.
- **`src/modules/orders/authorization.yaml`** – Defines the scope/permission rules (`read:Order`, `display:Order`, `export:Order`, `read:StockLevel`, etc.) that the security and filter semantics in this spec reference.
- **`src/modules/cart/openapi.yaml`** – The cart module's contract produces the payload that feeds `POST /orders` at checkout; the two contracts share product/line item shapes and the `shared/contracts/openapi.root.yaml` base.
- **`src/modules/cart/module.ts`** – Runtime implementation of the cart; the order-creation path here assumes the cart has already reserved stock and produced a line-item list.
- **`src/modules/delivery/module.yaml`** – Defines shipping/fulfillment operations; the `fulfillmentStatus`, `ORDER_ADDRESS_LOCKED`, and `ORDER_SHIP_TO_COUNTRY_NOT_SUPPORTED` semantics in this spec are the order-side half of that lifecycle.

## Notes

- **Sort syntax** is JSON:API style (`?sort=-price,title`), not the more common comma-separated bare names.
- **`deleted` filter** is tri-state: `true` → soft-deleted only, `false` → live only, *absent* → both. A caller without permission to see deleted rows gets an empty page for `true`.
- **Dual bounding on `POST /orders`**: the schema hard-caps at 1000 lines / 999 999 units; the deployment may tighten via `NODE_ADMIN_ORDER_MAX_LINES` and `NODE_ADMIN_ORDER_MAX_LINE_QUANTITY`. A body exceeding the *deployment* cap returns `422 ORDER_LINE_LIMIT_EXCEEDED` even if it is under the schema cap.
- **Export excludes addresses** deliberately (encrypted at rest); the spec calls this out so implementers do not add the columns.
- **`x-personal-data` is not a live endpoint** – it is a fragment a bundler splices into `AccountExportResponse`; removing the module removes the section automatically.
- The file references shared definitions via a relative path five levels up (`../../../shared/contracts/openapi.root.yaml`); all `$ref` resolution depends on that directory layout being stable.
