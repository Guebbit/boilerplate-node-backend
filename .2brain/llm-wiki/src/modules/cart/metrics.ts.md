---
source: src/modules/cart/metrics.ts
source_sha256: 50fbe90b8ff3c0e6115a8dfaad7f9412311a78143a57de96bb033e8029757cb8
context_sha256: b6ddfb24ee30975e0e71f7f31db1d0b5d9f800c1df3032645ff187c8d8df6c33
generated_at: 2026-11-22T04:33:15.235228+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/cart/metrics.ts

## Purpose
Declares the Prometheus counters owned by the cart module. The counters live in the module rather than in `infrastructure`. The file's header points to `src/modules/account/metrics.ts` for the rationale and for how the overview endpoint reads them without importing this file.

## Key elements
- `cartCheckoutTotal`: a `prom-client` `Counter` named `cart_checkout_total`. It counts checkout (cart → order) attempts and is labelled by `status`. It is registered on `metricsRegistry`.
  - `labelNames` is declared `as const`, so `inc({ status })` is type-checked against the literal label names instead of accepting any string key.
  - The source comment calls it the most revenue-critical counter in the app. A rising failure ratio means money is not being taken and should page someone rather than wait for a dashboard glance.

## Relationships
- `src/infrastructure/observability/metrics-registry.ts`: provides `metricsRegistry`, which this file imports and passes in `registers`, so the counter is exposed through that shared registry.
- `src/modules/cart/controllers/post-checkout.ts`: a graph neighbor of this file. The file itself doesn't show how the controller uses the counter.

## Notes
- The name follows the Prometheus convention `<domain>_<subject>_total` for counters.
- The file doesn't define which `status` values exist.
