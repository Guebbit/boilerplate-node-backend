---
source: src/modules/delivery/openapi.yaml
sha256: 240f30978a33ba42cbbaf77d6292e82b2ddf088b5e1e71f5f21d48df51f7c3de
generated_at: 2026-11-08T05:31:43.514529+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/openapi.yaml

## Purpose

OpenAPI 3.1.0 contract for the **delivery** module — the "After the sale" family covering fulfillment orders and shipments. It declares the module's REST endpoints, shared error-code vocabulary, and the slices of account data export the module contributes.

## Key elements

- **`tags`** — A single `Delivery` tag scoped to "After the sale"; all operations file under it.
- **`x-error-codes`** — Module-level error vocabulary (12 codes, all `409` or `422`) covering shippability, physical/digital mismatches, hold/release, loss, supersession, and order-state preconditions. Consumers reference these by name rather than raw status.
- **`x-personal-data`** — Declares the `shipments` and `fulfillmentOrders` sections that the bundler splices into `POST /account/export`. Removing the module removes these sections automatically.
- **`GET /delivery/methods`** — Public catalogue of shipping methods (no auth). Explicitly a list, not a quote; authoritative pricing is enforced at `PUT /cart/shipping-method` and checkout.
- **`GET /orders/{id}/fulfillment-orders`** — Lists an order's fulfillment orders (groups of lines that ship together). Unpaged. Unpaid orders return `items: []` rather than 404. Hold fields are audience-filtered (`holdNotice` vs. `holdMessage`/`holdReason`/`holdNote`).
- **`GET /orders/{id}/shipments`** — Lists an order's shipments (oldest first, with tracking code). Unpaged. Each item's own read lives at `GET /delivery/shipments/{id}`.
- **`POST /orders/{id}/process`** — Transitions an order `paid → processing`. Narrower than `update:Order`; requires `start:Shipment`, not `update:Order`. Returns the updated `Order` schema from `../orders/openapi.yaml`.
- **`GET /delivery/fulfillment-orders`** — Paged "preorder board" for staff. Filters by `cause` (preorder/backorder/any), `state`, `productId`, `late`, and `dueWithin`. Audience: staff with `display:Order` see all rows; others see only their own.

## Relationships

- **`src/modules/delivery/module.yaml`** — Module metadata (name, version, registration). This `openapi.yaml` is the contract that `module.yaml` points to as the module's API surface.
- **`src/modules/delivery/authorization.yaml`** — Defines the auth scopes/policies (e.g. `start:Shipment`, `display:Order`) that the `security` blocks and per-caller `actions` in this contract depend on.
- **`src/modules/delivery/module.ts`** — Runtime module wiring; registers the routes and middleware that fulfill the operations declared here.

## Notes

- The file is truncated in the source; additional paths (individual fulfillment-order and shipment reads, shipment creation, hold/release, deliver, lose, reopen) are implied by the error codes and descriptions but were not visible in the provided content.
- Cross-references reach into `../../../shared/contracts/openapi.root.yaml` for shared parameters (`IdPathParam`, `PageParam`, `PageSizeParam`), responses, and the `Id` schema — these are resolved at build time by the OpenAPI bundler.
- `POST /orders/{id}/process` returns the `Order` schema via a relative `$ref` to `../orders/openapi.yaml`, making this file a consumer of the orders module's contract.
- Unpaged list endpoints (`GET /orders/{id}/fulfillment-orders`, `GET /orders/{id}/shipments`) return `items: []` for empty results rather than a 404 — a deliberate convention to distinguish "nothing to show" from "not found".
