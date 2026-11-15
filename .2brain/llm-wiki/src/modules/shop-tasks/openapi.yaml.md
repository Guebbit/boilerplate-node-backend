---
source: src/modules/shop-tasks/openapi.yaml
sha256: 85c319e95d8971dcdfbd815546a3a763bb84fb543a266c6d5f58b1b77df13f94
generated_at: 2026-11-14T21:51:47.877888+00:00
model: ollama:qwen3.8:27b
---

# src/modules/shop-tasks/openapi.yaml

## Purpose
OpenAPI 3.1.0 contract for the `shop-tasks` module. It defines the single API endpoint (`GET /shop-tasks/summary`) that returns per-screen work counts for staff navigation badges, along with the response schema and security requirements. It exists so the contract is explicit, versionable, and independent of the TypeScript implementation.

## Key elements
- **`GET /shop-tasks/summary`** (`operationId: getShopWorkSummary`) — returns one integer count per staff screen. Always returns `0` (never omits) for screens the caller can see; omits the key entirely if the caller lacks permission. Authenticated via `bearerAuth`; always evaluated in the caller's session (no API-key path). Explicitly never cached.
- **`ShopWorkSummary` schema** — flat object (`additionalProperties: false`) with five integer fields, each `minimum: 0`:
  - `salesOrders` — orders with `fulfillmentStatus=awaiting_shipment` (requires `display:Order`)
  - `salesPayments` — rows listed by `GET /payments/attention`, all sources (each capped at 100); awaiting transfers excluded (requires `display:Payment`)
  - `returns` — returns with `status=requested` (requires `read:Return`)
  - `salesPreorders` — preorder fulfillment orders with `late=true` (requires `display:Order`)
  - `inventory` — stock levels at or under the low-stock threshold, `lowOnly=true` (requires `read:StockLevel`)
- **`401` response** — reuses a shared `Unauthorized` definition from `../../../shared/contracts/openapi.root.yaml`.
- **Tag `Shop`** — groups the operation under the "Running the shop" family.

## Relationships
- **`src/modules/shop-tasks/module.ts`** — the implementation that fulfils this contract. The `operationId`, path, response shape, and permission gates defined here are what `module.ts` is expected to satisfy.

## Notes
- Field presence is permission-gated: a key is absent (not `null`, not `0`) when the caller cannot open that screen. This is a deliberate distinction from the `0` sentinel for "screen is visible but empty."
- The `salesPayments` count is an aggregate of multiple sources, each individually capped at 100, so the total is not a true count of all pending payments.
- The contract specifies OpenAPI **3.1.0** (not 3.0.x); tooling that only supports 3.0 will not validate this file correctly.
