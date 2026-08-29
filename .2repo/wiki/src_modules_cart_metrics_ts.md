# src/modules/cart/metrics.ts

## Purpose

Declares the Prometheus counter(s) owned by the cart module—specifically the checkout-attempt metric. Keeping domain counters in the module (rather than in `infrastructure`) preserves ownership boundaries; the module that mutates the metric is the one that declares it.

## Key elements

- **`cartCheckoutTotal`** (`Counter`) — Named `cart_checkout_total`, labelled by `status`. Tracks every checkout attempt (cart → order) and its outcome. Described in-file as the most revenue-critical counter in the app: a rising failure ratio is a page-worthy event, not a dashboard glance.

## Relationships

- **`src/infrastructure/observability/metrics-http.ts`** — Provides `metricsRegistry`, the shared Prometheus registry this counter registers into at construction time. This is the sole import from infrastructure.
- **`src/modules/cart/controllers/post-checkout.ts`** — The checkout controller that increments `cartCheckoutTotal` (with a `status` label) on each attempt, making this counter the observable signal of that controller's success/failure.

## Notes

- The file's doc comment points to `modules/account/metrics.ts` as the canonical explanation for *why* metrics live in the module directory and for how an overview endpoint can read them without a direct import. Check that file if you're wondering about cross-module metric visibility.
- The counter uses `labelNames: ['status'] as const`—incrementing it requires a `status` value (e.g. `success`, `failure`); calling `.inc()` without the label will throw.
