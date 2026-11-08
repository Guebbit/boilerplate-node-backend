---
source: src/modules/observability/http-readback.ts
sha256: b1556df740328e5134822615ac41bf1defd205ab9bc2faf0109789356136c750
generated_at: 2026-11-08T06:39:14.019306+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/http-readback.ts

## Purpose

Reads the shared Prometheus HTTP metrics (request/error counters and the duration histogram) and reduces them to the single aggregate numbers consumed by the in-app `GET /observability/metrics/overview` endpoint and the SSE stream: total requests, total errors, and approximate p50/p95 latency. It exists so that the module-level consumers don't each re-implement prom-client histogram parsing.

## Key elements

- **`sumMetricValues(values)`** — exported. Sums the `value` field across all label-series entries returned by a prom-client counter `get()`. Re-exported for use by the overview controller, which sums additional counters the same way.
- **`aggregateLatencyBuckets(values)`** — internal. Collapses a histogram's `get()` result into per-boundary cumulative counts (summed across all method/route series) plus the total sample count (from the `+Inf` bucket). Skips `_sum`/`_count` rows (identified by a set `metricName` field).
- **`percentileFromHistogramBuckets(buckets, totalCount, percentile)`** — exported. Walks ascending buckets and returns the first boundary whose cumulative count meets `totalCount × percentile`. Returns the highest finite bound as a floor if the target rank falls in the `+Inf` range. Returns `0` when no data exists.
- **`getHttpRequestCounters()`** — exported, async. Reads `httpRequestsTotal` and `httpRequestErrorsTotal` in parallel and returns `{ totalRequests, totalErrors }`.
- **`getLatencyPercentiles()`** — exported, async. Reads `httpRequestDuration`, aggregates its buckets, and returns `{ p50, p95 }` in milliseconds.

## Relationships

- **Imports** `httpRequestsTotal`, `httpRequestErrorsTotal`, `httpRequestDuration` from `src/infrastructure/observability/metrics-http.ts` (the prom-client metric definitions).
- **Consumed by** `src/modules/observability/controllers/get-observability-metrics-overview.ts`, which calls `sumMetricValues`, `getHttpRequestCounters`, and `getLatencyPercentiles` to build the overview response.
- **Consumed by** `src/modules/observability/services/stream.ts`, which calls the same exported functions to publish periodic updates over SSE.
- **Tested by** `src/modules/observability/tests/unit/http-readback.test.ts`.

## Notes

- Percentiles are **bucket boundaries**, not interpolated values. A true p95 of 60 ms will report as 100 ms (the next bucket edge). This is a deliberate simplification; for accurate values, query the scraped histogram with Prometheus `histogram_quantile`.
- All counters and percentiles reflect the **entire process lifetime** (since boot), not a recent window. A latency spike gets diluted over time.
- prom-client `get()` is async (a `collect()` hook may be asynchronous), so all exported readers return promises even though the underlying data is in-memory.
- The `metricName` field on a sample is the only reliable way to distinguish `_sum`/`_count` derived rows from actual bucket rows; omitting this check inflates counts.
- `toSorted` is used (not `sort`) to keep the input array unmutated; requires a Node/JSC runtime that supports it (ES2023+).
