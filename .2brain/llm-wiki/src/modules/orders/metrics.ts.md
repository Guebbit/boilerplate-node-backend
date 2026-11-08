---
source: src/modules/orders/metrics.ts
sha256: 46d5a172eb1d95b1ab22552923524f689fa06723fcce969b6111508988d33aed
generated_at: 2026-11-08T06:52:32.397894+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/metrics.ts

## Purpose

Defines the single Prometheus counter owned by the orders module — `order_created_total` — which tracks admin-created orders. Counters live in the owning domain module (not in infrastructure) so each module is self-contained; the pattern rationale is documented in `modules/account/metrics.ts`.

## Key elements

- **`orderCreatedTotal`** (`Counter`) — Unlabelled Prometheus counter (`order_created_total`) that increments each time a staff member creates an order. Kept deliberately separate from `cart_checkout_total` so manual orders do not skew the customer checkout success rate.

## Relationships

- **`src/infrastructure/observability/metrics-registry.ts`** — Provides the shared `metricsRegistry` instance into which `orderCreatedTotal` is registered (via the `registers` array). This is the sole import dependency of this file.
- **`src/modules/orders/controllers/post-order.ts`** — The controller that handles order creation; expected to import and increment `orderCreatedTotal` when an admin successfully places an order.
- The overview/read endpoint consumes this counter's value **without** importing this file (it reads from the shared registry), avoiding a direct module coupling.

## Notes

- The counter is intentionally **unlabelled**: admin-created orders have no user-facing failure mode that would benefit from a label distinction.
- Do not add labels or rename the metric without updating dashboards/alerts that reference `order_created_total`.
- The "why here, not in infrastructure" convention is cross-referenced to `modules/account/metrics.ts`; keep both files consistent if the policy changes.
