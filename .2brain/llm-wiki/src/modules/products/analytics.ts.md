---
source: src/modules/products/analytics.ts
sha256: 156a28ed8aa6cb6008f4c00f9dfa53c45a5cd01e5a34e638f8c97c0b1fe67692
generated_at: 2026-10-15T11:39:28.172905+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/analytics.ts

## Purpose

Declares the products-domain analytics event names and registers them into the app-wide `AnalyticsEventMap` type. It exists so the products module can emit typed discovery events (`products_searched`, `product_viewed`) through the shared analytics port without duplicating the string literals at call sites.

## Key elements

- **`productsAnalyticsEvents`** (exported const) — Two event-name constants: `PRODUCTS_SEARCHED` → `'products_searched'` and `PRODUCT_VIEWED` → `'product_viewed'`. Both are classified as top-of-funnel discovery events, not purchase events.
- **`declare module '@infrastructure/observability/analytics'`** — Module augmentation that adds a `products` key to the `AnalyticsEventMap` interface, whose type is the union of the values in `productsAnalyticsEvents`. This makes the two names available as a type-level union for the analytics port.

## Relationships

- **`src/modules/products/browser-events.ts`** — The browser-side module that actually dispatches these event names over `POST /analytics/events`. This file only defines the names; the HTTP send happens in the browser-events layer (as noted in the doc comment referencing `docs/tools/analytics.md#who-sends-which-event`).
- **`tests/unit/infrastructure/observability/analytics.test.ts`** — Unit-tests the analytics infrastructure, exercising the augmented `AnalyticsEventMap` that this file contributes to.

## Notes

- The events are sent **client-side only** (browser → `POST /analytics/events`). The doc comment explains this is because the server-side response cache hides most product reads from the server, so the server never observes them directly.
- Naming follows the convention in `docs/tools/analytics.md#naming` (snake_case, past participle).
- The module-augmentation pattern mirrors `./audit.ts`'s registration of audit action names into the same port.
- The file is a `@module` (no default export); consumers import the named `productsAnalyticsEvents` constant or rely on the type augmentation implicitly.
