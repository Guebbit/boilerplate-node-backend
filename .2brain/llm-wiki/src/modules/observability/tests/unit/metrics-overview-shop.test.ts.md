---
source: src/modules/observability/tests/unit/metrics-overview-shop.test.ts
sha256: 21ccae4d3b1ed5625e968ca3b3029909af3fc837e687b3fa8f8d045b77864682
generated_at: 2026-10-15T10:57:31.661329+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/tests/unit/metrics-overview-shop.test.ts

## Purpose

Unit tests for the `business` block of the `GET /observability/metrics/overview` endpoint, covering only the counters owned by shop modules (cart and orders). The file is deliberately isolated from the rest of the overview suite so that removing the shop removes exactly this file and nothing else.

## Key elements

- **`describe('observability metrics overview — the shop block')`** — the top-level test suite; clears all mocks before each test.
- **`reports checkouts from the cart module counter`** — increments `cart_checkout_total` by 4, re-runs the overview, and asserts `business.checkoutSuccess` rose by exactly 4.
- **`reports created orders from the orders module counter`** — increments `order_created_total` by 5, re-runs the overview, and asserts `business.ordersCreated` rose by exactly 5.
- **`reports zero for a counter no enabled module registered`** — removes `cart_checkout_total` from the shared registry, asserts the field degrades to `0`, then restores the metric so later suites see it.
- **`jest.mock('@infrastructure/http/response', …)`** — replaces `successResponse`/`rejectResponse` with no-op fns to avoid real HTTP side-effects during the overview run.

## Relationships

- **`src/infrastructure/observability/metrics-registry.ts`** — Provides the process-global `metricsRegistry` instance. Side-effect imports of the shop modules register counters on this registry; the third test calls `getSingleMetric` / `removeSingleMetric` / `registerMetric` directly.
- **`src/modules/cart/module.ts`** — Imported purely for its side effect: registers `cart_checkout_total` on the shared registry at module-load time.
- **`src/modules/orders/module.ts`** — Imported purely for its side effect: registers `order_created_total` on the shared registry at module-load time.
- **`src/modules/observability/tests/unit/metrics-overview.support.ts`** — Supplies the `counter()` helper (lookup + increment) and `runOverview()` helper (invokes the overview endpoint and returns the parsed payload) used by every test in this file.

## Notes

- The cart/orders imports are **side-effect-only** (no named bindings). Their sole purpose is to populate the shared registry before tests run.
- The third test **mutates the process-global registry** and must restore the removed metric before finishing; the inline comment warns that later suites read the same instance.
- The file documents its isolation intent in the module-level JSDoc: removing the shop should not require editing any other test file.
