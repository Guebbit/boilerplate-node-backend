---
source: src/modules/cart/metrics.ts
sha256: beeafe6b9dde169543ad7ea473b0e63eda076736f9bfb9fb9892f34949aaf2a4
generated_at: 2026-09-23T18:30:34.790434+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/metrics.ts

## Purpose

Declares the domain-owned Prometheus counters for the cart module. Metrics live here (rather than in `infrastructure`) so the module is the single source of truth for what it tracks; the overview endpoint reads them from the shared registry without needing to import this file.

## Key elements

- **`cartCheckoutTotal`** (exported `Counter`) — Counts checkout (cart → order) attempts, labelled by `status` (success / failure, etc.). Uses the Prometheus naming convention `<domain>_<subject>_total`. The `labelNames` array is narrowed with `as const` so that `.inc({ status })` calls are type-checked against the allowed label names.

## Relationships

- **`src/infrastructure/observability/metrics-registry.ts`** — Imports the shared `metricsRegistry` instance and passes it via the `registers` option so the counter is exposed on the global metrics endpoint. This file owns _what_ is counted; the registry owns _where_ it is collected and served.
- **`src/modules/cart/controllers/post-checkout.ts`** — The checkout controller increments `cartCheckoutTotal` with the appropriate `status` label after a checkout attempt completes (or fails).

## Notes

- The `as const` on `labelNames` is load-bearing for type safety: without it, `inc()` would accept any string key and a typo in the label name would go undetected at compile time.
- The module-level doc block cross-references `modules/account/metrics.ts` for the _why_ behind the "metrics live in the module" convention.
