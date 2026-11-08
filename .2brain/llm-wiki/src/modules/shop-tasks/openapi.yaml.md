---
source: src/modules/shop-tasks/openapi.yaml
sha256: 257fdee832cc7a1f0bb74ff8bb69ebe7fd424cbb54eb9f0730454c4953e65173
generated_at: 2026-11-08T08:15:57.508740+00:00
model: ollama:qwen3.8:27b
---

# src/modules/shop-tasks/openapi.yaml

## Purpose

OpenAPI 3.1.0 contract for the **shop-tasks** module. It defines the single public endpoint (`GET /shop-tasks/summary`) that returns per-screen badge counts for staff navigation, and the `ShopWorkSummary` response schema. The file exists to document and constrain the module's API surface independently of its implementation.

## Key elements

- **Tag `Shop`** — namespace for the module's operations; carries `x-family: "Running the shop"`.
- **`getShopWorkSummary`** (`GET /shop-tasks/summary`) — returns one integer count per staff screen that displays a badge. Authenticated via `bearerAuth` (session, never API key). Responses: `200` with `ShopWorkSummary`, `401` (reuses shared root contract).
- **`ShopWorkSummary` schema** — `additionalProperties: false` object with five integer fields (each `minimum: 0`, present only when the caller has access to that screen):
  - `salesOrders` — paid/processing orders (incl. held). Requires `display:Order`.
  - `salesPayments` — rows listed by `GET /payments/attention` (each source capped at 100). Requires `display:Payment`.
  - `returns` — returns with `status=requested`. Requires `read:Return`.
  - `salesPreorders` — fulfillment orders where `late=true`. Requires `display:Order`.
  - `inventory` — stock levels at/below low-stock threshold. Requires `read:StockLevel`.
- **401 response** — `$ref` into `../../../shared/contracts/openapi.root.yaml#/components/responses/Unauthorized`, keeping the error definition in one place.

## Relationships

- **`src/modules/shop-tasks/module.ts`** — the module that implements the operations declared in this contract. The OpenAPI file is its declarative specification; `module.ts` is the executable side.

## Notes

- Counts are **per-caller** (session-scoped) and explicitly **never cached** — the spec calls this out in the description to prevent a consumer from memoizing the response.
- A field is *present* (possibly `0`) only when the caller can open that screen; absence means "you don't have access," not "zero."
- The `salesPayments` description references an external endpoint (`GET /payments/attention`) and an internal cap of 100 per source; the cap is a semantic constraint, not enforced by the schema.
- Version is pinned at `0.1.0` — treat the contract as pre-stable; field names or semantics may shift.
