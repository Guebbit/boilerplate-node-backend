# src/modules/cart/metrics.ts

## Purpose

Owns the Prometheus counter(s) for the cart domain—specifically checkout attempt outcomes. Following the pattern established in `modules/account/metrics.ts`, the counter lives in the domain module (not in `infrastructure`) so that the overview endpoint can read its value without a direct import into this file.

## Key elements

- **`cartCheckoutTotal`** — A `Counter` (from `prom-client`) named `cart_checkout_total`. Tracks total checkout attempts with a single `status` label. Registered against `metricsRegistry`. Intended to be incremented by the checkout controller with the outcome (e.g. success/failure).

## Relationships

- **`src/infrastructure/observability/metrics-http.ts`** — Provides `metricsRegistry`, the default (or custom) Prometheus registry the counter registers into. This is the sole import.
- **`src/modules/cart/controllers/post-checkout.ts`** — The likely caller that invokes `cartCheckoutTotal.inc({ status })` after processing a checkout attempt. (Inferred from the counter's purpose; the file itself does not import the controller.)

## Notes

- `labelNames: ['status'] as const` narrows label keys to the literal `'status'`, so `inc({ status })` is type-checked rather than accepting arbitrary string keys.
- The module-level doc comment explicitly defers *why* metrics live in the domain module (vs. `infrastructure`) to `modules/account/metrics.ts`. Consult that file for the full rationale.
- The overview endpoint reads the counter's value **without** importing this file—do not add cross-imports expecting a different consumption path.
