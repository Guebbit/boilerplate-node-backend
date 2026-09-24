---
source: src/modules/payments/metrics.ts
sha256: e0b1a59aaa4e4b5a6536f73ea84367a65eaa547e19593fd6beff8b9a66419b47
generated_at: 2026-09-23T19:18:18.459753+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/metrics.ts

## Purpose

Defines the Prometheus counters owned by the payments module. The counters live here (in the domain module) rather than in `infrastructure/observability` so that metric ownership follows the business capability. The overview endpoint reads them via the shared registry without needing to import this file directly.

## Key elements

- **`paymentConfirmTotal`** (`Counter`, exported) — Counts payment-confirmation attempts, labelled by `outcome` (e.g. success, decline). The label split is intentional: a decline spike at steady volume signals a fraud or provider incident, whereas summing outcomes would mask that signal.

## Relationships

- **`src/infrastructure/observability/metrics-registry.ts`** — Imports the shared `metricsRegistry` instance and registers `paymentConfirmTotal` with it, making the metric available to the central collector.
- **`src/modules/payments/controllers/post-payment-confirm.ts`** — The confirmation controller that increments `paymentConfirmTotal` (with the appropriate outcome label) as part of its request handling.

## Notes

- Only one counter is defined here; the module's convention (noted in the header comment and mirrored in `modules/account/metrics.ts`) is that each domain module owns its own metric definitions in a co-located `metrics.ts`.
- The counter uses `labelNames: ['outcome']`. Any new outcome value must be a finite, known set — open-ended labels will create unbounded series on the Prometheus side.
