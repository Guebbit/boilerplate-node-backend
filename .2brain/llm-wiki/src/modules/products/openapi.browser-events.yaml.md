---
source: src/modules/products/openapi.browser-events.yaml
sha256: 1a477da24908b9b852976661b90157d70ce0f7ac24fbaab3ac9502614355cf16
generated_at: 2026-11-08T07:45:31.901749+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/openapi.browser-events.yaml

## Purpose

OpenAPI fragment defining the browser-side analytics events emitted by product pages via `POST /analytics/events`. It exists as a fragment (components only) so it can be assembled into the `AnalyticsEventRequest` oneOf schema by the contract script, keeping event definitions co-located with the product module rather than in a monolithic root document.

## Key elements

- **`ProductViewedEvent`** — Schema for the `product_viewed` event. Requires `event` (discriminator) and `productId` (typed via the shared `Id` schema). No other properties allowed.
- **`ProductsSearchedEvent`** — Schema for the `products_searched` event. Requires `event`, `resultCount` (integer, 0–100 000), and `page` (shared `Page` schema). Optionally includes `text` (shared `Text` schema) when a free-text term was searched.
- **Event discriminator convention** — Each schema declares its event exactly once as a single-value `enum`; that value doubles as the oneOf discriminator and the key registered on `module.ts`.

## Relationships

- **`src/modules/products/authorization.yaml`** — Sibling fragment in the same product module. Both live under `src/modules/products/` and are assembled together by the same module/contract tooling, though this file does not reference any of authorization.yaml's schemas directly.
- **`scripts/contracts/analytics-browser-events.ts`** — Consumes this fragment and injects its schemas into the `AnalyticsEventRequest` oneOf (discriminated on `event`), but only when the `analytics` module is present.
- **`shared/contracts/openapi.root.yaml`** — Source of the shared `Id`, `Text`, and `Page` component schemas referenced via `$ref` paths rooted at the project root.

## Notes

- This is a **fragment**, not a standalone OpenAPI document. It has no `openapi`, `info`, or `paths` keys. Do not validate it as a complete spec.
- All `$ref` targets are written relative to the root file (e.g., `../../../shared/contracts/openapi.root.yaml#…`), not relative to this file's own location.
- `additionalProperties: false` on both schemas means adding a new field requires a schema change here, not just a client-side update.
- The file only takes effect at assembly time; it has no runtime role on its own.
