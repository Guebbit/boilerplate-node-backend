---
source: src/modules/example/metrics.ts
sha256: c64f00d8bdd62d7475f539c17111d8cd6b49e0c60f301cc1d18bb547b4f826ea
generated_at: 2026-10-15T10:30:45.267502+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/metrics.ts

## Purpose

Defines the Prometheus counters owned by the example module and registers them on the shared observability registry. The file is intentionally self-contained: removing it (and the corresponding `.inc()` call at the usage site) fully disables module metrics with no other cleanup needed.

## Key elements

- **`exampleCreatedTotal`** (`Counter`) — A Prometheus counter (`example_created_total`) that tracks the total number of examples created. Registered directly against the shared `metricsRegistry`.

## Relationships

- **`src/infrastructure/observability/metrics-registry.ts`** — Provides the shared `metricsRegistry` instance; this counter is pushed into it at definition time, making it part of the process-wide metrics collection.
- **`src/modules/example/services/crud.ts`** — The expected call-site for `exampleCreatedTotal.inc()`. That file increments the counter when an example is successfully created.

## Notes

- This file is documented as *optional*. The module still functions correctly without it; you only lose the single "is anyone using this module?" signal.
- Follows the Prometheus naming convention `<domain>_<subject>_total` for counters.
- See `docs/tools/observability.md` for the broader metrics/observability conventions used across the repo.
