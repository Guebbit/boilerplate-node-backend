---
source: src/modules/observability/metrics.ts
sha256: a86507e471ec8460197742bb452e7a32481eccad339d3837a923331629e92da9
generated_at: 2026-10-15T10:55:20.705371+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/metrics.ts

## Purpose

Defines the `dependency_up` Prometheus gauge that reports, per backing service (`database`, `cache`, `queue`), whether it is currently serving. It exists to close the observability gap where, if a dependency like Mongo goes down, every other gauge that depends on it stops reporting and alerting rules go blind exactly when they are needed most.

## Key elements

- **`_dependencyUp`** (`Gauge`) — A single gauge named `dependency_up` with label `dependency`. Uses a `collect()` callback so the value is computed lazily at scrape time (zero I/O cost). Maps `ready` → `1`, `connecting` → `0`, and **skips** `disabled` entries entirely (absence of a label value, not a `0`). Registered on `metricsRegistry`.

## Relationships

- **`@infrastructure/observability/metrics-registry`** — Provides the `metricsRegistry` instance the gauge is attached to; this is the single registry all module-level metrics share.
- **`./services/dependency-health`** — Supplies `dependencyHealth()`, the in-memory status map that `collect()` iterates over on every scrape.
- **`module.ts`** (same directory) — The module entry point that imports this file so the gauge is registered when the observability module loads.
- **`tests/unit/dependency-up.test.ts`** — Unit tests covering the gauge's label mapping, the `disabled`-skipping behaviour, and the `collect()` lifecycle.

## Notes

- The gauge is **pull-based** (`collect()`), not push-based. Calling `.reset()` inside `collect()` on every scrape means stale labels are dropped automatically if a dependency is removed at runtime.
- `connecting` intentionally reports `0` (not serving yet); the Prometheus `for` clause on alert rules is expected to absorb normal startup transient windows.
- `disabled` (e.g. Redis or RabbitMQ not configured) is **not reported at all**. This is a deliberate choice: absence encodes "supported deployment without that dependency," while a `0` would trigger false alerts.
- The gauge is exported as `_dependencyUp` (underscore prefix) — it is not part of the public API; consumers discover it by its Prometheus metric name `dependency_up`.
