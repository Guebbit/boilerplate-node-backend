---
source: src/modules/orders/openapi.yaml
sha256: ddb81d764d156422a43c6b3eb680a5dbda53cff782195865853bab9fd191edb5
generated_at: 2026-11-14T20:39:37.861907+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/openapi.yaml

## Purpose

The OpenAPI 3.1.0 contract for the orders module. It declares the module's public API surface (paths, parameters, request/response schemas), the module-specific error-code vocabulary, and the orders slice of the account personal-data export. Other modules and the bundler consume this file to compose the full API spec, generate code, and enforce error semantics.

## Key elements

- **`x-error-codes`** – Module-level error vocabulary (13 codes, e.g. `ORDER_INSUFFICIENT_STOCK`, `ORDER_PRODUCT_UNAVAILABLE`, `ORDER_LINE_LIMIT_EXCEEDED`, `ORDER_ADDRESS_LOCKED`, `ORDER_SHIP_TO_COUNTRY_NOT_SUPPORTED`, `ORDER_OVERRIDE_AWAITING_STOCK`). Each carries an HTTP status and a human-readable description; individual operations re-list the subset that applies to them.
- **`x-personal-data`** – Declares the `orders` and `orderTimeline` arrays that the bundler injects into `AccountExportResponse`. Removing the module removes this section.
- **`tags`** – Single tag `Orders` (family: Buying) that all operations file under.
- **`paths./orders`** – `GET` (paginated list with rich filters: status, fulfillment, payment, date ranges, deleted, etc.) and `POST` (admin/staff order creation with idempotency-key support).
- **`paths./orders/export`** – `GET` CSV export; requires the step-up-gated `export:Order` scope; caps rows via `NODE_ORDER_EXPORT_MAX_ROWS`.
- **Component schemas (referenced)** – `Order`, `CreateOrderRequest`, `OrdersResponse`, `OrderSort`, `OrderStatus`, `OrderFulfillmentFilter`, `OrderPaymentStatus`, `OrderReturnStatus`, `ExportOrder`, `OrderTimelineExportEntry`, plus module-local parameters (`UserIdParam`, `ProductIdParam`, `OrderNumberParam`).
- **Shared-contract refs** – Pagination, idempotency-key header, email schema, standard 401/403/404/409/422 responses all come from `shared/contracts/openapi.root.yaml`.

## Relationships

- **`src/modules/orders/module.yaml`** – Module manifest that registers this file as the module's OpenAPI contract and lists its scopes, events, and other artifacts.
- **`src/modules/orders/authorization.yaml`** – Defines the permission scopes (`read:Order`, `display:Order`, `create:Order`, `export:Order`, `read:StockLevel`, etc.) that appear in this spec's `security` blocks and in error-code descriptions.
- **`src/modules/cart/openapi.yaml`** – Sibling module contract; the cart→order checkout flow is the primary upstream consumer of the `POST /orders` endpoint declared here.
- **`src/modules/cart/module.ts`** – Cart module implementation; produces the payload that `POST /orders` accepts.
- **`src/modules/delivery/module.yaml`** – Delivery module manifest; order `fulfillmentStatus` values (`shipped`, `delivered`, `partially_fulfilled`, `awaiting_shipment`) are the bridge between this contract's state machine and the delivery workflow.

## Notes

- **Bundler conventions** – `x-versioned: [post]` on `POST /orders` tells the bundler to add `ETag` / `Content-Location` headers. `x-personal-data` is spliced into the global `AccountExportResponse`; you do not see it in the module's own path responses.
- **Scope-dependent visibility** – `GET /orders` with `read:Order` alone returns only the caller's own orders and ignores `userId`; `display:Order` sees all. `deleted=true` returns an empty page to callers who cannot see soft-deleted rows.
- **Double-capped creation body** – The schema hard-caps at 1 000 lines × 999 999 units; a deployment may tighten via `NODE_ADMIN_ORDER_MAX_LINES` / `NODE_ADMIN_ORDER_MAX_LINE_QUANTITY`, producing `422 ORDER_LINE_LIMIT_EXCEEDED`.
- **Address privacy in exports** – CSV export deliberately omits shipping/billing addresses (encrypted at rest); the personal-data export includes them because the buyer owns that data.
- **GDPR / Pankki S** – `orderTimeline` includes staff-written reasons because the export is the buyer's data; the staff actor's identity stays in the audit log (CJEU C-579/21).
- **Sort grammar** – `?sort=` uses JSON:API style: comma-separated field names, leading `-` for descending.
