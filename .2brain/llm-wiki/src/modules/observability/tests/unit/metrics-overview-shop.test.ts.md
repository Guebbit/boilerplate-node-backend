---
source: src/modules/observability/tests/unit/metrics-overview-shop.test.ts
sha256: 21ccae4d3b1ed5625e968ca3b3029909af3fc837e687b3fa8f8d045b77864682
generated_at: 2026-11-08T06:43:30.200461+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/tests/unit/metrics-overview-shop.test.ts

## Purpose

Unit tests for the `business` block returned by `GET /observability/metrics/overview`, covering only the counters owned by shop modules (cart, orders). Extracted from the general overview suite so that removing a shop module deletes exactly this file and nothing else.

## Key elements

- **Side-effect imports of `@modules/cart/module` and `@modules/orders/module`** — loading these manifests registers the shop's real counters on the shared `metricsRegistry`.
- **`jest.mock('@infrastructure/http/response', …)`** — stubs `successResponse` / `rejectResponse` so no real HTTP serialization occurs.
- **`describe('…the shop block')`** — three cases:
  - *reports checkouts from the cart module counter* — increments `cart_checkout_total` by 4 via the `counter` helper, re-runs the overview, asserts `business.checkoutSuccess` increased by 4.
  - *reports created orders from the orders module counter* — same pattern for `order_created_total` → `business.ordersCreated`.
  - *reports zero for a counter no enabled module registered* — removes `cart_checkout_total` from the registry, asserts the row degrades to `0`, then re-registers the metric (see Notes).

## Relationships

- **`src/infrastructure/observability/metrics-registry.ts`** — the process-global `metricsRegistry` instance; tests read counters through it (via `counter()`) and the "removed counter" test calls `getSingleMetric` / `removeSingleMetric` / `registerMetric` directly.
- **`src/modules/observability/tests/unit/metrics-overview.support.ts`** — supplies the `counter` helper (fetches a metric by name) and `runOverview` (executes the overview request and returns the parsed body).
- **`src/modules/cart/module.ts`** / **`src/modules/orders/module.ts`** — imported purely for their side-effect of registering counters; no symbols are destructured.

## Notes

- The registry is **process-global**; the "removed counter" test restores the metric before finishing because sibling suites in the same worker read the same instance. Forgetting the restore would silently zero out the cart counter for every subsequent test file.
- The shop-module imports are side-effect-only (no named bindings). Adding a named import or tree-shaking would break counter registration.
- `beforeEach` calls `jest.clearAllMocks()` to reset the HTTP-response stubs between cases.
