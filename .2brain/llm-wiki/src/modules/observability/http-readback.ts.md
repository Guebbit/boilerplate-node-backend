---
source: src/modules/observability/http-readback.ts
sha256: b1556df740328e5134822615ac41bf1defd205ab9bc2faf0109789356136c750
generated_at: 2026-10-15T10:54:59.330795+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/http-readback.ts

## Purpose

Reads the shared HTTP request counters and duration histogram (defined in `metrics-http`) and collapses them into single service-wide numbers: total requests, total errors, and approximate p50/p95 latency. These numbers feed both the `GET /observability/metrics/overview` endpoint and the SSE stream publish.

## Key elements

- **`sumMetricValues`** (exported) — Sums the `.value` field across all label-combination entries returned by a prom-client `get()` call. Exported so the overview controller can reuse it for its own counters.
- **`LatencyBucket`** (interface) — A single histogram bucket: `upperBound` (ms) and `cumulativeCount` (observations ≤ bound).
- **`aggregateLatencyBuckets`** (internal) — Flattens prom-client histogram `get()` output into per-boundary cumulative totals, skipping the derived `_sum`/`_count` rows (identified by a set `metricName`). Returns sorted buckets and the `+Inf` total count.
- **`percentileFromHistogramBuckets`** (exported) — Walks cumulative buckets in ascending order and returns the first boundary whose cumulative count reaches `totalCount × percentile`. A deliberate boundary-bound approximation (over-estimates within a bucket); returns `0` when no data exists.
- **`getHttpRequestCounters`** (exported) — `Promise.all`s `httpRequestsTotal.get()` and `httpRequestErrorsTotal.get()` so both totals are read at the same instant; returns `{ totalRequests, totalErrors }`.
- **`getLatencyPercentiles`** (exported) — Calls `httpRequestDuration.get()`, aggregates buckets, and returns `{ p50, p95 }` in milliseconds.

## Relationships

- **`src/infrastructure/observability/metrics-http.ts`** — Source of the three prom-client metrics this file imports (`httpRequestsTotal`, `httpRequestErrorsTotal`, `httpRequestDuration`).
- **`src/modules/observability/controllers/get-observability-metrics-overview.ts`** — Consumes `sumMetricValues`, `getHttpRequestCounters`, and `getLatencyPercentiles` to build the overview response.
- **`src/modules/observability/services/stream.ts`** — The module docblock states these same aggregates are published on the SSE stream.
- **`src/modules/observability/tests/unit/http-readback.test.ts`** — Unit tests for the exported functions in this file.

## Notes

- **Percentile approximation:** The result is always a bucket *boundary*, so a true p95 of 60 ms with a 100 ms boundary will report as 100 ms. For accurate interpolation, query the scraped histogram with Prometheus `histogram_quantile` instead.
- **Process-lifetime scope:** All counters and the histogram accumulate since process start; a single spike is diluted over time. There is no time-windowing here.
- **Empty-data guard:** `percentileFromHistogramBuckets` returns `0` (not `NaN`) when `totalCount` is 0, preventing dashboard breakage on a fresh process.
- **`sumMetricValues` is exported intentionally** — the overview controller sums its own additional counters the same way and reuses this helper rather than duplicating the reduce.
