---
source: scenarios/values/orders.ts
sha256: 2ab1143188a81ba2cb06aa265337a2d82b1b5b7c6ef1675d75f7f555cfc9c28d
generated_at: 2026-10-29T01:28:03.002985+00:00
model: ollama:qwen3.8:27b
---

# scenarios/values/orders.ts

## Purpose

Provides example (placeholder) values for the `orderId` field in generated API-client collections (Bruno, Insomnia, Postman). Because demo-shop order IDs are minted dynamically at shop build time and cannot be hard-coded, this file substitutes `{{name}}` collection variables that the HTTP clients resolve at send time. The orders section's first probe request is expected to populate these variables.

## Key elements

- **`ORDER_ID_VARIABLE`** (private const) — the literal string `{{orderId}}`, used as the canonical placeholder for any order ID.
- **`collectionValues`** (exported const, type `CollectionValues`) — the sole public export.
  - `byProperty.orderId` — maps the property name `orderId` to the variable, so generated request bodies that reference `orderId` receive the placeholder.
  - `pathParam(name, template)` — returns the variable when `name === 'id'` **and** `template.startsWith('/orders')`; returns `undefined` for every other path, leaving non-order routes untouched.
  - `tokens.seedOrderId` / `tokens.seedDeletedOrderId` — named collection variables (`{{orderId}}`, `{{deletedOrderId}}`) that the generated collection references for seed-order and deleted-order scenarios.

## Relationships

- **`scenarios/collection-values.ts`** — supplies the `CollectionValues` type that `collectionValues` conforms to. This file is a per-resource implementation of that shared contract.

## Notes

- The `pathParam` guard (`template.startsWith('/orders')`) is load-bearing: without it the `id` path segment on *every* resource (products, users, etc.) would be rewritten to `{{orderId}}`.
- `seedDeletedOrderId` intentionally uses a *different* variable name (`{{deletedOrderId}}`) rather than reusing `ORDER_ID_VARIABLE`, so the two slots can hold distinct values after the first probe runs.
- Nothing here is a literal ID; treating `{{orderId}}` as a concrete value will produce a 404.
