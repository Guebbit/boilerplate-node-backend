---
source: src/modules/observability/http-readback.ts
sha256: ecc7622089c484daeb7741ad34ce38e9dd2fde7a1f38046fad258b4bf5101773
generated_at: 2026-09-23T18:56:00.361723+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/http-readback.ts

## Purpose

Reads the shared prom-client HTTP counters and duration histogram and collapses them into the simple aggregate numbers (total requests, total errors, p50, p95) consumed by the in-app `GET /observability/metrics/overview` endpoint and the SSE metrics stream. It exists so that UI-facing code never has to interpret raw Prometheus histogram bucket semantics directly.

## Key elements

- **`sumMetricValues`** (exported) — Sums the `value` field across every label-series entry returned by a prom-client `get()` call. Generic utility; the overview controller reuses it for its own counters.
- **`aggregateLatencyBuckets`** (internal) — Walks the raw histogram `get()` output, skips the derived `_sum`/`_count` rows (identified by a set `metricName`), sums counts per bucket boundary across all method/route series, and extracts the `+Inf` bucket as the total sample count. Returns sorted `LatencyBucket[]` plus `totalCount`.
- **`percentileFromHistogramBuckets`** (exported) — Given sorted cumulative buckets and a percentile fraction (0–1), returns the first bucket boundary whose cumulative count reaches `totalCount × percentile`. Returns `0` when no data exists.
- **`getHttpRequestCounters`** (exported, async) — Reads `httpRequestsTotal` and `httpRequestErrorsTotal` in parallel via `Promise.all` and returns `{ totalRequests, totalErrors }`.
- **`getLatencyPercentiles`** (exported, async) — Reads `httpRequestDuration`, aggregates buckets, and returns `{ p50, p95 }` in milliseconds.
- **`LatencyBucket`** (internal interface) — `{ upperBound, cumulativeCount }`; the count is cumulative (≤ boundary), matching Prometheus semantics.

## Relationships

- **`src/infrastructure/observability/metrics-http.ts`** — Import source. Provides the three prom-client metric objects (`httpRequestsTotal`, `httpRequestErrorsTotal`, `httpRequestDuration`) that this file reads.
- **`src/modules/observability/controllers/get-observability-metrics-overview.ts`** — Primary consumer. Calls `getHttpRequestCounters`, `getLatencyPercentiles`, and `sumMetricValues` to build the JSON response for the overview endpoint.
- **`src/modules/observability/services/stream.ts`** — Consumes the same aggregate functions to publish a metrics snapshot over the SSE stream.
- **`src/modules/observability/tests/unit/http-readback.test.ts`** — Unit tests covering bucket aggregation and percentile estimation.

## Notes

- **Approximate percentiles.** The returned value is always a bucket *boundary*, so the true latency within that bucket is over-estimated (e.g. a 60 ms p95 reports as 100 ms). This is intentionally simpler than Prometheus `histogram_quantile` interpolation; for precise values, query the scraped histogram directly.
- **Process-lifetime totals.** All counts and percentiles cover the entire process lifetime, not a sliding window. A single spike dilutes over time. The module doc comment points to `docs/tools/opentelemetry.md` for windowed queries.
- **`toSorted` (ES2023 / Node ≥ 20).** Used instead of `[...arr].sort(...)`; no mutation of the source array.
- **Zero-safe.** Both `getHttpRequestCounters` and `getLatencyPercentiles` return `0` (not `NaN`) when no samples have been recorded yet, preventing downstream dashboard breakage on a freshly started process.
- **Async reads are required.** prom-client `get()` returns a promise because a `collect()` hook may be async; the functions here are therefore async even though they perform no I/O themselves.
