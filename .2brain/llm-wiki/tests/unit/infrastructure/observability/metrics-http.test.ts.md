---
source: tests/unit/infrastructure/observability/metrics-http.test.ts
sha256: 0b253b1b7d6ce31495799f2f935119703d056ea7392449fd929530f551a5083f
generated_at: 2026-09-23T20:25:03.141183+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/observability/metrics-http.test.ts

## Purpose

Unit tests for the HTTP metrics module (`metrics-http.ts`). Validates that route-label extraction produces bounded cardinality, that request and error counters are recorded correctly, and that in-flight gauges are registered in the Prometheus registry.

## Key elements

- **`routed(baseUrl, path?)`** — local helper that returns a minimal `asStub<Request>` shaped like an Express request after routing; sets `route.path` only when `path` is provided.
- **`describe('getRouteLabel')`** — four cases: template extraction from mounted routes, trailing-slash normalization on router roots, collapse of unmatched/regex/array paths to `UNMATCHED_ROUTE`, and rejection of non-string `route.path` values.
- **`describe('recordRequestMetric')`** — verifies `http_requests_total` is incremented with method/route labels, that `http_request_errors_total` fires only for 4xx (not 2xx), and that the emitted Prometheus text contains the expected label pairs.
- **`describe('incrementInflight / decrementInflight')`** — calls both then asserts `http_requests_in_flight` is present in the registry output.

## Relationships

- **`src/infrastructure/observability/metrics-http.ts`** — the module under test; all exported symbols (`getRouteLabel`, `recordRequestMetric`, `incrementInflight`, `decrementInflight`, `UNMATCHED_ROUTE`) are imported here.
- **`src/infrastructure/observability/metrics-registry.ts`** — `getPrometheusMetrics` is called after each mutation to read the rendered metric text and assert on it.
- **`tests/support/stub.ts`** — `asStub` is used to build lightweight `Request` objects without a full Express instance.

## Notes

- The file's doc comment on `describe('getRouteLabel')` explains *why* cardinality is bounded to declared routes: prom-client never evicts series, so any unbounded label (e.g. raw request path) would grow the registry indefinitely under scanner traffic.
- Assertions on `recordRequestMetric` and in-flight tests are **async** (`await getPrometheusMetrics()`) because the registry renders lazily; the `getRouteLabel` tests are synchronous pure-function checks.
- The "does not increment error counter for 2xx" test searches the rendered text line-by-line rather than using `toContain`, because a blanket absence assertion would be weakened by other series sharing the metric name.
