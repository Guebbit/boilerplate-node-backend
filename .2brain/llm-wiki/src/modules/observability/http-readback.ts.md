---
source: src/modules/observability/http-readback.ts
source_sha256: 5ee322f2ba131158f5192822701e4ce807c4f63ded5d6970a2f837765eab99e9
context_sha256: 7bc67b27f70d4f83eb482a9f3b8f44072a74305c62f302e22f25d704f0f018ec
generated_at: 2026-11-22T06:01:29.786037+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/observability/http-readback.ts

## Purpose
Converts the shared HTTP Prometheus metrics (request counter, error counter, duration histogram) into the numbers published by `GET /observability/metrics/overview` and the SSE stream: service-wide totals and approximate p50/p95 latency. Totals are summed across every method/route series.

## Key elements
- `sumMetricValues(values)` — sums `value` across all label series of a prom-client `get()` result. Exported so the overview controller can total its own counters the same way.
- `percentileFromHistogramBuckets(buckets, totalCount, percentile)` — exported. Walks ascending cumulative buckets and returns the first upper bound whose cumulative count reaches `totalCount * percentile`. Returns `0` when there is no data. If the target rank falls in the `+Inf` bucket, returns the highest finite bound.
- `getHttpRequestCounters()` — reads `httpRequestsTotal` and `httpRequestErrorsTotal` in parallel via `Promise.all`. Resolves to `{ totalRequests, totalErrors }`.
- `getLatencyPercentiles()` — reads `httpRequestDuration`, aggregates its buckets, and resolves to `{ p50, p95 }`.
- `aggregateLatencyBuckets` (internal) — sums bucket counts per `le` boundary across all series. It skips rows that have `metricName` set (the `_sum`/`_count` rows) and rows with no `le`. The `+Inf` bucket becomes `totalCount`. Output buckets are sorted ascending.

## Relationships
- Imports `httpRequestsTotal`, `httpRequestErrorsTotal` and `httpRequestDuration` from `src/infrastructure/observability/metrics-http.ts`, which owns the metric definitions. This file only reads them.
- `src/modules/observability/controllers/get-observability-metrics-overview.ts` uses `sumMetricValues` for its own counters. It is also the HTTP endpoint these numbers feed.
- `src/modules/observability/services/stream.ts` is a neighbor, and the module doc says the SSE stream publishes these numbers.
- `src/modules/observability/tests/unit/http-readback.test.ts` is the unit test for this file.

## Notes
- Percentiles are bucket boundaries, not interpolated values. A true p95 of 60ms can report as 100ms. This is a deliberate simplification compared with Prometheus `histogram_quantile`.
- Values cover the whole process lifetime, not a recent window, so spikes get diluted over time. Use `histogram_quantile` on the scraped histogram for windowed values.
- Histogram buckets are cumulative. Skipping the `metricName` rows is necessary, because including them would badly inflate the counts.
- A fresh process reports `0` for percentiles rather than `NaN`.
