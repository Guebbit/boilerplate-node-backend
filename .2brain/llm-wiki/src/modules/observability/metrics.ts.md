---
source: src/modules/observability/metrics.ts
sha256: a86507e471ec8460197742bb452e7a32481eccad339d3837a923331629e92da9
generated_at: 2026-11-08T06:39:40.645435+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/metrics.ts

## Purpose

Defines the `dependency_up` Prometheus gauge, which reports whether each backing service (database, cache, queue) is currently serving. It exists to fill an observability gap: when a dependency goes down, other gauges (job counts, outbox depth) stop updating and alerts go silent. This gauge answers the question "is the dependency alive?" with a pure memory read, so it reports even when the dependency itself is unreachable.

## Key elements

- **`_dependencyUp`** (module-scoped `Gauge`): A single gauge with label `dependency`. Uses a `collect()` callback (pull-based) that resets and re-evaluates all series on every scrape. Maps `ready → 1`, `connecting → 0`, and silently omits `disabled` services.
- **No public exports.** The gauge is registered on the shared `metricsRegistry` as a side effect of module import; consumers (scrapers, alert rules) reference it by its Prometheus name.

## Relationships

- **`src/infrastructure/observability/metrics-registry.ts`** — Provides the `metricsRegistry` instance the gauge registers into; this is the single registry exposed to the `/metrics` endpoint.
- **`src/modules/observability/services/dependency-health.ts`** — Supplies the `dependencyHealth()` function that the `collect()` callback reads at scrape time. No I/O is performed here; it is a pure memory read of previously cached statuses.
- **`src/modules/observability/module.ts`** — Imports this file so the gauge is registered when the observability module is loaded (side-effect import pattern).
- **`src/modules/observability/tests/unit/dependency-up.test.ts`** — Unit tests that exercise the `collect()` logic against various `dependencyHealth()` return values.

## Notes

- The gauge uses **pull-based collection** (`collect()`), not push. Values are never set proactively; they are computed fresh each scrape. This means there is no stale-value problem, but it also means the value only exists transiently during a scrape cycle.
- `disabled` is deliberately **not reported** (no series emitted). Downstream alert rules must treat *absence of a series* as "not configured," not as "down." A `connecting` state maps to `0`, so it *will* trip alerts; the intended mitigation is a `for` clause in the alert rule to ride out normal startup.
- The underscore prefix (`_dependencyUp`) signals module-private; do not import this binding from outside the module.
