---
source: src/modules/example/metrics.ts
sha256: a0ecdda6e5cd98757d59a67f0d596c4fc86b83173b961be0a44c577ba2f68271
generated_at: 2026-11-08T05:50:33.279902+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/metrics.ts

## Purpose

Declares the Prometheus counters owned by the `example` module. It registers them on the shared observability registry so they are exposed alongside counters from all other modules. The module currently tracks a single metric: how many examples have been created.

## Key elements

- **`exampleCreatedTotal`** (exported `Counter`) — A Prometheus counter named `example_created_total` with the help text "Total examples created." Registered on the shared `metricsRegistry`. Intended to be incremented (`.inc()`) wherever an example is successfully created.

## Relationships

- **`src/infrastructure/observability/metrics-registry.ts`** — Provides the `metricsRegistry` instance that this file imports and passes as the `registers` array for its counter. This is the single shared registry for the whole application.
- **`src/modules/example/services/crud.ts`** — The expected caller that invokes `exampleCreatedTotal.inc()` to record a new example. The module-level doc comment explicitly notes that if the module ever stops tracking this, both the `.inc()` call in that service and this file should be deleted.

## Notes

- The module-level doc comment prescribes a delete rule: if the module no longer counts anything, remove this file *and* the corresponding `.inc()` call. Keeping an unused counter file is considered clutter.
- Prometheus naming convention applied: `<domain>_<subject>_total` for counters (e.g. `example_created_total`). Follow this pattern if you add counters.
