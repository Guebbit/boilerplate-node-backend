---
source: scenarios/values/orders.ts
sha256: dc903f7b331b1633c2c04e1107cf8270179141f5da0b64841bd002ed119566f6
generated_at: 2026-11-14T17:18:56.108083+00:00
model: ollama:qwen3.8:27b
---

# scenarios/values/orders.ts

## Purpose

Provides example placeholder values for order-related IDs in the generated API client collections. Because the demo shop mints order IDs at runtime (they differ on every build), literal IDs would 404; instead, this file hands Bruno `{{variable}}` slots that the orders collection's own first probe resolves before subsequent requests fire.

## Key elements

- **`ORDER_ID_VARIABLE`** — Module-local constant holding the string `'{{orderId}}'`, the single placeholder used wherever an order ID is expected.
- **`collectionValues`** (exported, typed as `CollectionValues`) — The sole export. Its shape:
  - `byProperty.orderId` — Maps the `orderId` property to the placeholder so generated requests substitute it.
  - `pathParam(name, template)` — Returns the placeholder when the path parameter is named `id` **and** the template starts with `/orders`; returns `undefined` otherwise.
  - `tokens.seedOrderId` / `tokens.seedDeletedOrderId` — Named slots (`{{orderId}}` / `{{deletedOrderId}}`) available to collection-level or request-level variables.

## Relationships

- **`scenarios/collection-values.ts`** — Supplies the `CollectionValues` type that `collectionValues` must conform to. This file is a concrete per-domain implementation of that interface.

## Notes

- The file deliberately avoids literal IDs. If you need a concrete order ID at runtime, the *first* request in the orders collection is expected to mint one and store it into the `orderId` / `deletedOrderId` Bruno variables; this file only defines the *shape* of the substitution.
- The `pathParam` guard checks both the parameter name (`'id'`) **and** the path prefix (`/orders`) to avoid false positives on other resources that also use an `id` path parameter.
