---
source: src/modules/orders/tests/unit/line-ceilings.test.ts
sha256: e1e6d4d01081b063f34c2e54035e1fab64e1d89182322e374107af08256985c2
generated_at: 2026-10-15T11:20:07.175400+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/line-ceilings.test.ts

## Purpose

Guards against drift between the TypeScript ceiling constants in `config.ts` and the corresponding limits declared in the OpenAPI contract (`orders/openapi.yaml`). If the two sources ever disagree, this test fails, preventing the service from silently accepting or rejecting orders that the contract permits or forbids.

## Key elements

- **`OrdersContract`** — interface that narrows the OpenAPI YAML shape to only the two schema properties the test inspects (`maxItems` on `CreateOrderRequest.items` and `maximum` on `OrderLineInput.quantity`).
- **`contract`** — the result of reading and parsing `../../openapi.yaml` via `readFileSync` + `yaml`'s `parse`, cast to `OrdersContract`.
- **`describe('the admin order ceilings')`** — single test block asserting:
  - `ADMIN_ORDER_LINES_CEILING` equals `CreateOrderRequest.properties.items.maxItems`
  - `ADMIN_ORDER_LINE_QUANTITY_CEILING` equals `OrderLineInput.properties.quantity.maximum`

## Relationships

- **`src/modules/orders/config.ts`** — source of the two imported constants (`ADMIN_ORDER_LINES_CEILING`, `ADMIN_ORDER_LINE_QUANTITY_CEILING`) that this test pins to the contract values.
- **`orders/openapi.yaml`** (resolved relative to `__dirname/../..`) — read at test-execution time; the test depends on this file existing at that path and containing the schemas referenced by the `OrdersContract` interface.

## Notes

- The YAML is loaded from disk at runtime, not bundled. The path is computed from `__dirname`, so the test must be run from a working directory where `src/modules/orders/openapi.yaml` is reachable.
- Only two leaf values are compared; any structural change in the OpenAPI file (renamed schemas, moved properties) will cause a TypeScript compile error in this test, surfacing the break early.
- The test is intentionally a 1:1 equality check (`toBe`), not a range or inequality assertion.
