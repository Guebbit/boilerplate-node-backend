---
source: src/modules/products/analytics.ts
sha256: 156a28ed8aa6cb6008f4c00f9dfa53c45a5cd01e5a34e638f8c97c0b1fe67692
generated_at: 2026-11-08T07:41:23.496296+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/analytics.ts

## Purpose

Declares the analytics event names for the products module and registers them into the app-wide analytics type system. These are top-of-funnel discovery events (search, product view) whose ratio to `CART_ITEM_ADDED` serves as a catalogue-health signal. They are emitted client-side via `POST /analytics/events` because server-side response caching hides most product reads.

## Key elements

- **`productsAnalyticsEvents`** – `as const` object exporting two event-name keys:
  - `PRODUCTS_SEARCHED` → `'products_searched'`
  - `PRODUCT_VIEWED` → `'product_viewed'`
- **Module augmentation of `@infrastructure/observability/analytics`** – extends the `AnalyticsEventMap` interface with a `products` key typed to the values above, so the analytics port's event union includes these names across the app.

## Relationships

- **`src/modules/products/browser-events.ts`** – the browser-side emitter that references `productsAnalyticsEvents` when dispatching discovery events to the analytics endpoint.
- **`tests/unit/infrastructure/observability/analytics.test.ts`** – exercises the analytics port contract, including the event-name map this file contributes to.

## Notes

- This file is **type-and-constant only**; it imports nothing and has no runtime side effects beyond the `const` export.
- Naming follows the convention documented in `docs/tools/analytics.md#naming` (snake_case, past-participle for actions).
- The module augmentation is the integration point: any code consuming the analytics port will see these names in its event union without an explicit import of this file.
