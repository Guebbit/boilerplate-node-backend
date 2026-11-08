---
source: src/modules/cart/metrics.ts
sha256: beeafe6b9dde169543ad7ea473b0e63eda076736f9bfb9fb9892f34949aaf2a4
generated_at: 2026-11-08T05:14:13.457812+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/metrics.ts

## Purpose

Declares the domain-owned Prometheus counters for the cart module (currently: checkout attempts). Metrics live here—colocated with the cart domain—rather than in `infrastructure`, so the module is the single source of truth for what it measures. The overview endpoint reads these counters without importing this file directly (see `modules/account/metrics.ts` for the full rationale).

## Key elements

- **`cartCheckoutTotal`** (`Counter`) — Tracks total checkout (cart → order) attempts, labelled by `status` (`as const` narrows the label to a literal for type-safe `inc()` calls). Registered on the shared `metricsRegistry`. Described as the most revenue-critical counter in the app; a rising failure ratio warrants a page.

## Relationships

- **`src/infrastructure/observability/metrics-registry.ts`** — Imports the shared `metricsRegistry` instance and passes it as the `registers` array so the counter is exposed on the single global registry (single scrape endpoint).
- **`src/modules/cart/controllers/post-checkout.ts`** — The checkout controller that performs the cart → order transition is the expected call-site that increments `cartCheckoutTotal` with an appropriate `status` label on success or failure.

## Notes

- The `status` label is typed via `as const`, so any new status value must be added to that literal tuple; ad-hoc strings will fail at compile time.
- The doc comment points to `modules/account/metrics.ts` as the reference for the "why metrics live in the module" convention—check there if the pattern is unfamiliar.
- Naming follows Prometheus `<domain>_<subject>_total` convention; do not rename without coordinating on alerting rules that reference `cart_checkout_total`.
