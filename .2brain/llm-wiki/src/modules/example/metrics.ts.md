---
source: src/modules/example/metrics.ts
source_sha256: a746ba7707ad3311eba7b5a89007e9d6b50a6edfd5e992ae64a2a6bbe2bf5b6f
context_sha256: 4cae0d92cf6cc68805926450b3530a127b523eea1663489d45f2926babea5156
generated_at: 2026-11-22T05:09:13.267921+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/example/metrics.ts

## Purpose
Defines the Prometheus counters owned by the example module and registers them on the shared metrics registry. Currently it tracks a single number: how many examples have been created, which indicates whether the module is being used at all. The file is a template: its header says to delete it if a module counts nothing, and to drop the `.inc()` call along with it.

## Key elements
- `exampleCreatedTotal`: a `prom-client` `Counter` named `example_created_total` (help text "Total examples created."). It is registered explicitly on `metricsRegistry` through the `registers` option.

## Relationships
- `src/infrastructure/observability/metrics-registry.ts`: provides `metricsRegistry`, the shared registry this counter is registered on.
- `src/modules/example/services/crud.ts`: the module's CRUD service. The file header refers to an `.inc()` call that must be removed if this file is deleted, which implies the CRUD service increments the counter on creation. The metrics file itself does not show this.

## Notes
- Name counters `<domain>_<subject>_total`, per the Prometheus convention noted in the code.
- The counter is attached only to `metricsRegistry`, not to prom-client's default global registry.
