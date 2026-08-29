# src/modules/orders/metrics.ts

## Purpose

Defines and exports the Prometheus `Counter` for tracking total orders created (admin/staff-initiated). Lives in the orders module rather than in infrastructure so that the metric is owned by the domain it measures; the overview endpoint reads registered metrics without needing a direct import of this file.

## Key elements

- **`orderCreatedTotal`** (`Counter`) — Unlabelled counter named `order_created_total`. Tracks the total number of orders created. Registered against `metricsRegistry`. Deliberately kept separate from `cart`'s `cart_checkout_total` so that staff-created orders do not skew the customer checkout success rate.

## Relationships

- **`src/infrastructure/observability/metrics-http.ts`** — Provides `metricsRegistry`, the shared registry into which `orderCreatedTotal` is registered.
- **`src/modules/orders/controllers/write-orders.ts`** — Consumer of `orderCreatedTotal` within the same module (the write path increments the counter when an order is created).

## Notes

- The counter is intentionally **unlabelled**. The rationale (per the inline comment) is that admin-created orders have no user-facing failure mode worth segmenting on.
- Do not merge this counter with `cart_checkout_total`; the separation is a deliberate metric-design decision to keep checkout success-rate calculations clean.
- For the broader convention of *why* metrics live in the module (not in `infrastructure`) and how the overview endpoint reads them indirectly, see `modules/account/metrics.ts`.
