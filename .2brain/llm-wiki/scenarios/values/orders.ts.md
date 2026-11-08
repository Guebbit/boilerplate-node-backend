---
source: scenarios/values/orders.ts
sha256: 2ab1143188a81ba2cb06aa265337a2d82b1b5b7c6ef1675d75f7f555cfc9c28d
generated_at: 2026-11-08T02:36:12.046659+00:00
model: ollama:qwen3.8:27b
---

# scenarios/values/orders.ts

## Purpose

Supplies the example values (template-variable placeholders) that the generated API-client collections use wherever an order ID appears. Because order IDs are minted at runtime during shop setup and differ every session, this module hands request builders a `{{…}}` slot to fill rather than a literal ID that would 404.

## Key elements

- **`ORDER_ID_VARIABLE`** — Module-level constant holding the string `'{{orderId}}'`, the placeholder substituted for any order ID.
- **`collectionValues`** (export) — A `CollectionValues` object with three members:
  - `byProperty` — Maps the property name `orderId` to `ORDER_ID_VARIABLE` so body/query parameter resolution uses the placeholder.
  - `pathParam` — A resolver that returns `ORDER_ID_VARIABLE` when the path-param name is `id` **and** the route template starts with `/orders`; returns `undefined` for every other route, leaving other collections' path params untouched.
  - `tokens` — Collection-variable seeds: `seedOrderId` → `{{orderId}}`, `seedDeletedOrderId` → `{{deletedOrderId}}`.

## Relationships

- **`scenarios/collection-values.ts`** — Source of the `CollectionValues` type that `collectionValues` must satisfy. This file is the order-specific implementation of that contract; the type module defines the shape (`byProperty`, `pathParam`, `tokens`) shared by all per-resource value modules.

## Notes

- The `pathParam` guard (`template.startsWith('/orders')`) is intentional: without it the resolver would hijack any route whose path param happens to be named `id`.
- The doc comment states the orders section's *first probe* request is expected to populate `{{orderId}}` at collection-run time; the variable is not pre-filled here.
- `seedDeletedOrderId` deliberately uses a distinct variable name (`{{deletedOrderId}}`) so it can track a separate, already-deleted order without colliding with `{{orderId}}`.
