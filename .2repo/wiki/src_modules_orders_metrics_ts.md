# src/modules/orders/metrics.ts

## Purpose

Defines the Prometheus counter(s) for the orders domain. Counters live here (in the module) rather than in `infrastructure` so the overview endpoint can read them without a direct import into this file. This file owns the `order_created_total` metric for admin-created orders.

## Key elements

- **`orderCreatedTotal`** (`Counter`) — Exported Prometheus counter named `order_created_total`. Tracks total orders created by staff. Intentionally unlabelled and kept separate from cart's `cart_checkout_total` so manual orders don't distort the customer checkout success rate.

## Relationships

- **`src/infrastructure/observability/metrics-http.ts`** — Provides the shared `metricsRegistry` instance; this file registers its counter against it.
- **`src/modules/orders/controllers/write-orders.ts`** — Downstream consumer expected to increment `orderCreatedTotal` when an order is successfully created.

## Notes

- The counter has **no labels** by design — admin-created orders have no user-facing failure mode to distinguish. Do not add labels without a clear reason.
- The module doc points to `modules/account/metrics.ts` as the canonical explanation of *why* domain metrics live in the module layer. If the placement pattern seems unusual, check that file first.
- The overview endpoint reads these counters **without** importing this file directly (indirect access via the shared registry). Avoid adding side-effectful imports here.
