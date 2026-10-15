---
source: src/modules/products/browser-events.ts
sha256: a676dc63ce0365afd545840185b5aed9a721e04f649cbc9cd8d0d1c2db9822e2
generated_at: 2026-10-15T11:39:35.756833+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/browser-events.ts

## Purpose

Defines how the two product-page browser events (`POST /analytics/events` request bodies) are transformed into analytics report payloads. It is the runtime "relay" half of the analytics contract; the request shapes live in `./openapi.browser-events.yaml` and are folded into the analytics contract by the bundler.

## Key elements

- **`productsBrowserEvents`** (const, exported) — A `Record<string, BrowserEventTarget>` mapping each analytics event name to a `toReport` function that converts a camelCase request body into a `{ event, properties }` payload with snake_case property keys.
  - `PRODUCT_VIEWED` → maps `body.productId` → `properties.product_id`.
  - `PRODUCTS_SEARCHED` → maps `body.text`, `body.page`, `body.resultCount` → `properties.text`, `properties.page`, `properties.result_count`.

## Relationships

- **`src/kernel/registry.ts`** — Provides the `BrowserEventTarget` type, used as the `satisfies` constraint on the export.
- **`src/modules/products/analytics.ts`** — Provides `productsAnalyticsEvents` (the event-name constants used as object keys).
- **`src/types/index.ts`** — Provides `ProductViewedEvent` and `ProductsSearchedEvent` interfaces that type each `toReport` body parameter.

## Notes

- Property keys are intentionally snake_case (`product_id`, `result_count`) to match the naming already used in the analytics provider's dashboards; request bodies remain camelCase.
- The `satisfies Record<string, BrowserEventTarget>` clause enforces the registry shape at compile time without widening the literal object type.
- Event names are registered on the manifest under the same string each request body carries in its `event` field—keep the two in sync if adding events.
