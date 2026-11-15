---
source: src/modules/example/metrics.ts
sha256: 85a1e53c24e61957a55e19c256808362a9de4d556805c23756321958db00e50e
generated_at: 2026-11-14T19:58:31.011458+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/metrics.ts

## Purpose

Defines the Prometheus counters owned by the `example` module and registers them on the shared observability registry. Currently exposes a single counter (`example_created_total`) that tracks how many examples have been created, giving a signal of whether the module is being used at all.

## Key elements

- **`exampleCreatedTotal`** (exported `Counter`) — A Prometheus counter named `example_created_total`. Registered on `metricsRegistry`. Intended to be incremented (`.inc()`) wherever an example is successfully created.
- **`metricsRegistry`** (imported from `@infrastructure/observability/metrics-registry`) — The shared registry instance this counter attaches to, so it is collected alongside all other module metrics.

## Relationships

- **`src/infrastructure/observability/metrics-registry.ts`** — Provides the `metricsRegistry` instance. This file registers its counter against that registry so it is included in the global Prometheus scrape.
- **`src/modules/example/services/crud.ts`** — The call site that increments `exampleCreatedTotal` after a successful create operation (the module doc-comment notes that the `.inc()` call at this site should be removed if the counter is deleted).

## Notes

- Prometheus naming convention used: `<domain>_<subject>_total` for counters. Follow this pattern if adding more counters here.
- The file's doc-comment explicitly states: if the module stops counting anything, delete this file and remove the `.inc()` call at the call site. It is intentionally disposable.
- For broader context on the metrics system, see `docs/tools/prometheus.md` (referenced in the module JSDoc).
