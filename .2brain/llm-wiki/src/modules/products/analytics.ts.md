---
source: src/modules/products/analytics.ts
sha256: 932cea088401bb7fa165f90f446a47440049512ce4fadbfffc4f92e99d331510
generated_at: 2026-09-23T19:25:03.297469+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/analytics.ts

## Purpose

Declares the analytics event names emitted by the products module and registers them into the shared analytics port's type map. It is a type-level extension (plus a small const object) that lets the products module fire typed discovery events—product search and product view—without modifying the observability layer directly.

## Key elements

- **`productsAnalyticsEvents`** — `as const` object mapping two intents to string literals:
    - `PRODUCTS_SEARCHED` → `'products_searched'` (catalogue search)
    - `PRODUCT_VIEWED` → `'product_viewed'` (individual product page view)
- **Module augmentation** (`declare module '@infrastructure/observability/analytics'`) — adds a `products` key to `AnalyticsEventMap` so the port's generic event type now includes these two names, enabling compile-time checking at every call site.

## Relationships

- **`src/modules/products/service.ts`** — The service layer that calls the analytics port using the event names defined here. This file supplies the "what" (event names); the service supplies the "when" (the trigger logic).
- **`tests/unit/infrastructure/observability/analytics.test.ts`** — Exercises the analytics port that this file augments; the port's accepted event union must include the `products` key for those tests to compile.

## Notes

- Events are explicitly scoped to **top-of-funnel discovery** (search, view). They are _not_ purchase or cart events. The ratio of these to `CART_ITEM_ADDED` is the intended business metric.
- Event name strings must follow the convention in `docs/tools/analytics.md#naming`; the `as const` + augmentation pattern mirrors `./audit.ts`.
- This file contains no runtime logic beyond exporting the const object. All observable behavior lives in the service that fires the events.
