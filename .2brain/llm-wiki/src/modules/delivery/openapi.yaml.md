---
source: src/modules/delivery/openapi.yaml
sha256: 033ca2791f5c0cc176c1154fd8f6fa8669cdc558697ee35ff3abc778276914f7
generated_at: 2026-11-14T19:42:24.128052+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/openapi.yaml

## Purpose

The OpenAPI 3.1.0 contract for the **delivery** module — the "after the sale" family. It declares the module's public API surface (shipping-method catalogue, fulfillment-order and shipment reads, order-processing transition, preorder board) together with its error taxonomy and personal-data export bindings, so that every consumer (UI, bundler, docs) agrees on the same shapes before any code is written.

## Key elements

- **`x-error-codes`** — Module-level error vocabulary (`DELIVERY_NOT_SHIPPABLE`, `DELIVERY_LINES_INVALID`, `DELIVERY_NOT_PHYSICAL`, `DELIVERY_NOT_DIGITAL`, `DELIVERY_NOT_HOLDABLE`, `DELIVERY_NOT_RELEASABLE`, `DELIVERY_NOT_DELIVERABLE`, `DELIVERY_NOT_LOSABLE`, `DELIVERY_NOT_REOPENABLE`, `DELIVERY_LOST_SUPERSEDED`, `ORDER_NOT_PAID`, `ORDER_NOT_PROCESSING`). Each maps to an HTTP status (422 or 409) and a human-readable description of the state precondition that failed.
- **`x-personal-data`** — Declares the `shipments` and `fulfillmentOrders` sections the bundler injects into `POST /account/export`. Removing the module removes these sections.
- **`tags`** — Single `Delivery` tag carrying `x-family: "After the sale"` for doc-grouping.
- **`GET /delivery/methods`** — Public, unauthenticated catalogue of shipping methods (flat rates, free-above thresholds). Explicitly *not* a price quote.
- **`GET /orders/{id}/fulfillment-orders`** — Per-order list of fulfillment orders (groups of lines that leave together). Requires `read:Order`. Empty array (not 404) when the order is unpaid.
- **`GET /orders/{id}/shipments`** — Per-order list of shipments (oldest first), with tracking/delivered info. Requires `read:Order`.
- **`POST /orders/{id}/process`** — Transitions an order `paid → processing`. Requires `start:Shipment` (narrower than `update:Order`). Marked `x-versioned: [post]` so the bundler adds `ETag`/`Content-Location`.
- **`GET /delivery/fulfillment-orders`** — Paged preorder board with filters (`cause`, `state`, `productId`, `late`, `dueWithin`). Requires `read:Order`.
- **`security` scopes** used: `read:Order`, `start:Shipment`, `display:Order` (implied by descriptions).

## Relationships

- **`src/modules/delivery/authorization.yaml`** — Defines the named scopes (`read:Order`, `start:Shipment`, `display:Order`, `update:Order`) referenced in the `security` blocks and the role-based visibility rules described in the path descriptions (buyer vs. staff field filtering, such as `holdNotice` vs. `holdMessage`).
- **`src/modules/delivery/module.ts`** — The TypeScript module entry that loads this spec, registers its paths into the server router, and wires the `x-personal-data` export sections into the account-export handler.
- **`src/modules/delivery/module.yaml`** — Module manifest; declares the module's identity, its dependency on the shared contracts, and the order of bundling relative to other modules.

## Notes

- **Unpaged by default.** `/orders/{id}/fulfillment-orders`, `/orders/{id}/shipments`, and `/delivery/methods` are intentionally unpaged (small, bounded sets). Only the preorder board (`GET /delivery/fulfillment-orders`) accepts `Page`/`PageSize` params.
- **Absence ≠ 404.** An unpaid order's fulfillment-order list returns `items: []`, not a 404. Same for an order with no shipments.
- **Error codes are module-owned.** The 409/422 error set lives in this file's `x-error-codes`, not in a shared response object. Handlers must return the named code, not a generic 409.
- **`x-versioned` annotation.** The bundler interprets `x-versioned: [post]` on `POST /orders/{id}/process` to attach `ETag` and `Content-Location` headers; this is not standard OpenAPI and is meaningful only to the internal bundler.
- **Cross-module schema refs.** The spec pulls `Order` from `../orders/openapi.yaml` and shared parameters/responses from `../../../shared/contracts/openapi.root.yaml` — the delivery module does *not* re-declare those shapes.
- **File is truncated in the source above**; the full spec contains additional paths (individual shipment/fulfillment-order reads, ship, hold, release, deliver, lose, reopen endpoints) and a `components/schemas` section not shown here.
