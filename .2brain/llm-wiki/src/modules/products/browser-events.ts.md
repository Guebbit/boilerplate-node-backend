---
source: src/modules/products/browser-events.ts
source_sha256: 4558c977599b143fb05191c80717031f59c29058ea584ddbec53934d78c1d073
context_sha256: 7beccd9ecb93e5e172615cf19b5d342602d1d2abdc47d76560cf5bc0397f1c5d
generated_at: 2026-11-22T07:07:21.969325+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/products/browser-events.ts

## Purpose
Defines the browsing events a product page reports through `POST /analytics/events`, and how each request body is converted into an analytics event. The request shapes live in `./openapi.browser-events.yaml`, which the bundler folds into `analytics`' contract. This file is the matching runtime half that the relay calls.

## Key elements
- `productsBrowserEvents`: the only export. An object keyed by analytics event name, where each entry has a `toReport(body)` function. It is checked with `satisfies Record<string, BrowserEventTarget>`.
  - `PRODUCT_VIEWED`: takes a `ProductViewedEvent` and returns `{ event, properties: { product_id } }` from `body.productId`.
  - `PRODUCTS_SEARCHED`: takes a `ProductsSearchedEvent` and returns `{ event, properties: { text, page, result_count } }` from `body.text`, `body.page` and `body.resultCount`.

## Relationships
- `./analytics`: supplies `productsAnalyticsEvents`. Its `PRODUCT_VIEWED` and `PRODUCTS_SEARCHED` names are used both as the object keys and as the `event` value in each report.
- `@kernel/registry`: supplies the `BrowserEventTarget` type, which every entry must satisfy.
- `@types`: supplies the `ProductViewedEvent` and `ProductsSearchedEvent` body types.
- `module.ts`: the doc comment says this object is registered on the manifest under the event name each request body carries. The registration itself is not in this file.

## Notes
- Report properties use snake_case (`product_id`, `result_count`) because the provider's dashboards already use those names. Request bodies use camelCase, so the mapping is deliberate. Don't rename the properties.
- Keys are computed from `productsAnalyticsEvents`, so the registered event names follow that enum or constant, not string literals in this file.
- The file's doc comment points to a "the story" section of the analytics module documentation for further background.
