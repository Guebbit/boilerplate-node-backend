---
source: src/modules/products/openapi.browser-events.yaml
source_sha256: 1a477da24908b9b852976661b90157d70ce0f7ac24fbaab3ac9502614355cf16
context_sha256: 620b26c40176794c02becffd4c7f926907bc193c554c1f41ec5f12f810e952e4
generated_at: 2026-11-22T07:10:44.140989+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/products/openapi.browser-events.yaml

## Purpose
An OpenAPI fragment (components only, not a full document) that defines the browsing events a product page reports through `POST /analytics/events`. It is assembled into the `AnalyticsEventRequest` schema, a `oneOf` discriminated on `event`, by a build script. That assembly happens only while the `analytics` module exists.

## Key elements
- `ProductViewedEvent`: strict object (`additionalProperties: false`) with required `event` (enum `[product_viewed]`) and `productId` (shared `Id` schema, described as the product whose page was opened).
- `ProductsSearchedEvent`: strict object with required `event` (enum `[products_searched]`), `resultCount` (integer, 0–100000) and `page` (shared `Page` schema). It also has an optional `text` (shared `Text` schema), the free-text term searched for.

## Relationships
- `src/modules/products/openapi.yaml`: the module's main spec. This fragment is kept separate from it, and `openapi.yaml` is not referenced from this file's content.

## Notes
- Each schema names its event once, as a one-value `event` enum. That value is both the discriminator and the key the module registers under `browserEvents`.
- Adding an event means adding a schema here that follows this convention.
- Refs to shared schemas (`Id`, `Text`, `Page`) are written against the root contract file, as in any module fragment.
- Shared refs are wrapped in `allOf` where a `description` is attached (`productId`, `text`). `page` uses a bare `$ref`.
