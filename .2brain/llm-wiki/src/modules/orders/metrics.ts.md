---
source: src/modules/orders/metrics.ts
source_sha256: 46d5a172eb1d95b1ab22552923524f689fa06723fcce969b6111508988d33aed
context_sha256: 0ad6b705d10e0a606f86af58a6de429e4c9fe386316b21798d6b531199cd7d9e
generated_at: 2026-11-22T06:15:16.536769+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/metrics.ts

## Purpose
Declares the Prometheus counters owned by the orders module. Metrics live in the module rather than in `infrastructure`; the file's header points to `src/modules/account/metrics.ts` for the rationale and for how the overview endpoint reads them without importing this file.

## Key elements
- `orderCreatedTotal` — a `prom-client` `Counter` named `order_created_total` (help: "Total orders created."). It counts admin-created orders. It has no labels, because staff create these orders directly and there is no user-facing failure mode to distinguish.

## Relationships
- `src/infrastructure/observability/metrics-registry.ts` — supplies `metricsRegistry`. The counter registers itself there through `registers: [metricsRegistry]`, not on the default `prom-client` registry.
- `src/modules/orders/controllers/post-order.ts` — a graph neighbor. The file content does not show how the two interact, so this page does not describe it.

## Notes
- Keep this counter separate from `cart`'s `cart_checkout_total`. Mixing manual admin orders into the customer checkout counter would distort the checkout success rate.
