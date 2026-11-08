---
source: src/modules/products/browser-events.ts
sha256: a676dc63ce0365afd545840185b5aed9a721e04f649cbc9cd8d0d1c2db9822e2
generated_at: 2026-11-08T07:41:49.958627+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/browser-events.ts

## Purpose

Defines the product-page browsing events that arrive via `POST /analytics/events` and transforms each typed request body into the `{ event, properties }` shape the analytics relay expects. It is the "relay-call" half of a contract whose request schemas live in `./openapi.browser-events.yaml` (folded into the analytics module by the bundler).

## Key elements

- **`productsBrowserEvents`** (exported const) — Maps each analytics event name to an object with a single `toReport` function. The object is checked with `satisfies Record<string, BrowserEventTarget>` so the registry type validates every entry while preserving the literal keys.
  - `[PRODUCT_VIEWED].toReport` — Accepts a `ProductViewedEvent`, emits `properties: { product_id }`.
  - `[PRODUCTS_SEARCHED].toReport` — Accepts a `ProductsSearchedEvent`, emits `properties: { text, page, result_count }`.

## Relationships

- **`src/kernel/registry.ts`** — Source of the `BrowserEventTarget` type that constrains the shape of every entry in `productsBrowserEvents`.
- **`src/modules/products/analytics.ts`** — Provides the `productsAnalyticsEvents` enum/constants used both as object keys and as the `event` field in each report.
- **`src/modules/products/module.ts`** — The product module manifest; per the file's doc comment, these event entries are registered on that manifest under their event names.
- **`src/types/index.ts`** — Supplies the `ProductViewedEvent` and `ProductsSearchedEvent` types that parameterize each `toReport` signature.

## Notes

- Output property names are intentionally **snake_case** (`product_id`, `result_count`) to match the provider's existing dashboards, while the input types use camelCase. This is a deliberate naming split, not a bug.
- The request-body schemas are defined in a sibling YAML file (`openapi.browser-events.yaml`), not in this TS file. The bundler wires that YAML into the analytics contract; this file only handles the outbound transform.
- `satisfies` (not `as` or plain annotation) is used so the object keeps its literal keys for downstream lookups while still being type-checked against `BrowserEventTarget`.
