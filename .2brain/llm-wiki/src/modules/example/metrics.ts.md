---
source: src/modules/example/metrics.ts
sha256: a0ecdda6e5cd98757d59a67f0d596c4fc86b83173b961be0a44c577ba2f68271
generated_at: 2026-10-29T03:53:22.460058+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/metrics.ts

## Purpose

Declares the Prometheus counter(s) owned by the `example` module and registers them on the shared metrics registry. Currently exposes a single counter tracking how many examples have been created, giving operators a basic usage signal for the module.

## Key elements

- **`exampleCreatedTotal`** (exported `Counter`) — A `prom-client` counter named `example_created_total` with help text "Total examples created." Registered on `metricsRegistry`. Incremented (via `.inc()`) by module code to record each successful example creation.

## Relationships

- **`src/infrastructure/observability/metrics-registry.ts`** — Provides the shared `metricsRegistry` instance. This file registers its counter against it so the counter is collected alongside every other module's metrics.
- **`src/modules/example/services/crud.ts`** — Expected caller of `exampleCreatedTotal.inc()` when an example is created. This file does not import that module; the increment lives in the service layer.

## Notes

- The file's own doc comment acts as a deletion guide: if the module stops counting anything, remove this file *and* the corresponding `.inc()` call in the service.
- Prometheus naming convention used: `<domain>_<subject>_total` for counters. Follow this pattern if adding further counters here.
- Reference for the broader observability setup: `docs/tools/observability.md`.
