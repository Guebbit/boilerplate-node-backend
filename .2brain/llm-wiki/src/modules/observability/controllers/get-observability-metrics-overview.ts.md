---
source: src/modules/observability/controllers/get-observability-metrics-overview.ts
sha256: 88b49590472ed01ef633214f571e24fc2cb43c6831f9a4c0b9fadc89dfbcac67
generated_at: 2026-09-23T18:55:47.658229+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/controllers/get-observability-metrics-overview.ts

## Purpose

Controller for `GET /observability/metrics/overview`. Aggregates HTTP, auth, business, database, and process metrics into a single structured JSON response. It resolves every domain counter **by metric name** off the shared prom-client registry instead of importing the counter objects, which keeps this module decoupled from the domain modules it reports on (enforced by the `module-coupling-observability` dependency-cruiser rule).

## Key elements

- **`readCounter(name)`** — Looks up a metric by name via `metricsRegistry.getSingleMetric(name)`. Returns `[]` if the metric is absent (i.e. the owning module isn't in this build), so the response shape stays stable.
- **`sumByLabel(values, labelKey, labelValue)`** — Filters `MetricSample[]` by a specific label (e.g. `status: "success"`) and sums the matching values.
- **`getObservabilityMetricsOverview`** (exported) — The Express handler. Fires all metric reads in parallel with `Promise.all`, assembles an `ObservabilityMetricsSummary`, and replies via `successResponse`. Errors are funnelled through `catchAs`.
- **`MetricSample`** (local interface) — Shape of one prom-client sample: `{ value, labels }`.

## Relationships

- **`metrics-registry.ts`** — `readCounter` calls `metricsRegistry.getSingleMetric(name)` to resolve metrics by string name. This is the core decoupling mechanism.
- **`metrics-http.ts`** — `httpInflightRequests` gauge is imported directly (infrastructure-owned, not domain-owned) and read via `.get()`.
- **`http-readback.ts`** — Supplies `getHttpRequestCounters`, `getLatencyPercentiles`, and the `sumMetricValues` helper used throughout the aggregation.
- **`process-snapshot.ts`** — `processSnapshot()` provides uptime and memory figures for the `process` section of the response.
- **`response.ts`** — `successResponse` wraps the JSON payload.
- **`controller.ts`** — `catchAs` handles the error path and writes a structured error response.
- **`routes.ts`** — Registers this handler on the `/observability/metrics/overview` route.
- **`types/index.ts`** — `ObservabilityMetricsSummary` defines the response shape (fixed by `openapi.yaml`).
- **`metrics-overview.test.ts`** — Unit tests for the controller.

## Notes

- **Name-based lookup is intentional and enforced.** Importing domain counters (auth, cart, orders) would couple this module to three domains and make deleting any of them a compile error here. The dependency-cruiser rule `module-coupling-observability` restricts cross-module imports to `audit-logs` only.
- **Absent metric ≠ error.** If a module owning a counter is not in the current build, `readCounter` returns `[]` and the corresponding field reads as zero. The response shape is identical either way, so clients never need to know which modules are present.
- **Gauges are read identically to counters.** `products_low_stock_total` and `inventory_reserved_units_total` are gauges, but `readCounter` works the same way because prom-client's `.get()`/`collect` recounts at scrape time.
- **`httpInflightRequests` is the one direct import of a metric object.** It is infrastructure-owned (not a domain counter), so it bypasses the name-lookup pattern.
