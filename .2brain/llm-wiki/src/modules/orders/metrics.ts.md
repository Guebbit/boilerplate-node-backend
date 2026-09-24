---
source: src/modules/orders/metrics.ts
sha256: 46d5a172eb1d95b1ab22552923524f689fa06723fcce969b6111508988d33aed
generated_at: 2026-09-23T19:03:41.591842+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/metrics.ts

## Purpose

Defines the Prometheus domain counters owned by the orders module. By co-locating metric definitions with the domain logic (rather than in `infrastructure/observability`), the module self-documents what it measures and the overview endpoint can read them without a direct import into this file.

## Key elements

- **`orderCreatedTotal`** (Counter, `order_created_total`) — Unlabelled counter for staff/admin-created orders. Intentionally separate from cart's `cart_checkout_total` so that manual order creation does not skew the customer checkout success rate.

## Relationships

- **`src/infrastructure/observability/metrics-registry.ts`** — Provides the `metricsRegistry` instance that `orderCreatedTotal` registers against, making the counter discoverable by the shared `/metrics` scrape endpoint.
- **`src/modules/orders/controllers/write-orders.ts`** — The write-path controller that increments `orderCreatedTotal` when an admin creates an order.

## Notes

- The JSDoc points to `modules/account/metrics.ts` as the reference example for the "metrics live in the module, not in infrastructure" convention. Follow that pattern when adding counters to other modules.
- The counter is deliberately unlabelled. If a future use-case requires distinguishing order sources, add a label here rather than creating a second counter.
