---
source: src/modules/observability/tests/unit/metrics-overview-shop.test.ts
source_sha256: 3174bba39148a7aa0037ede60c0f7a118bf8ee99a15e09521fc69ac262f2101b
context_sha256: 6d30d102f5c2e9b32820e933df7611135ae7b5b46f3c2c985b31b17b5ddae013
generated_at: 2026-11-22T06:05:25.391219+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/observability/tests/unit/metrics-overview-shop.test.ts

## Purpose
Unit tests for the `business` block of `GET /observability/metrics/overview`, covering the counters owned by the shop modules (cart and orders). It is kept separate from the rest of the overview suite so that removing the shop only requires deleting this file.

## Key elements
- **Module imports of `@modules/cart/module` and `@modules/orders/module`**: loading the manifests registers the shop's real counters on the shared metrics registry.
- **`jest.mock('@infrastructure/http/response', ...)`**: replaces `successResponse` and `rejectResponse` with `jest.fn()` stubs.
- **Test "reports checkouts from the cart module counter"**: runs the overview, increments `cart_checkout_total` with `{ status: 'success' }` by 4, runs it again, and expects `business.checkoutSuccess` to rise by 4.
- **Test "reports created orders from the orders module counter"**: increments `order_created_total` by 5 and expects `business.ordersCreated` to rise by 5.
- **Test "reports zero for a counter no enabled module registered"**: removes `cart_checkout_total` from the registry and expects `business.checkoutSuccess` to be `0`. This simulates a deleted module. The test comment says the rest of the shop block should still be reported.
- **`beforeEach`**: calls `jest.clearAllMocks()`.

## Relationships
- `metrics-overview.support.ts`: supplies the `runOverview` and `counter` helpers. `runOverview` produces the overview result, and `counter(name)` is used to increment the named metric.
- `src/infrastructure/observability/metrics-registry.ts`: provides `metricsRegistry`. The third test calls `getSingleMetric`, `removeSingleMetric` and `registerMetric` on it directly.
- `src/modules/cart/module.ts` and `src/modules/orders/module.ts`: imported only for their side effect of registering `cart_checkout_total` and `order_created_total`.

## Notes
- The registry is process-global. The third test re-registers the removed metric at the end so later suites see the same instance. If an assertion fails before that line, the metric stays removed.
- The tests compare before and after values (deltas) rather than absolute values, because counters persist across tests.
- The file comment refers to `metrics-overview.test.ts` for the reasoning behind loading the manifests.
