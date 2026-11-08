---
source: tests/unit/infrastructure/observability/metrics-http.test.ts
sha256: 0b253b1b7d6ce31495799f2f935119703d056ea7392449fd929530f551a5083f
generated_at: 2026-11-08T10:21:06.915152+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/observability/metrics-http.test.ts

## Purpose

Unit tests for the HTTP request-metrics module (`metrics-http`). They verify that route labels are bounded to a finite set (cardinality safety), that the Prometheus counters for requests, errors, and in-flight gauges are recorded correctly, and that unmatched or non-string routes collapse into a single `UNMATCHED_ROUTE` label rather than leaking arbitrary paths into the metric namespace.

## Key elements

- **`routed(baseUrl, path?)`** — local helper that wraps `asStub<Request>` to produce a minimal Express `Request` carrying a `route.path` (or no route). Simulates the post-routing state that `getRouteLabel` reads.
- **`describe('getRouteLabel')`** — four test cases: template extraction from mounted routers, trailing-slash normalisation for router roots, unmapped paths → `UNMATCHED_ROUTE`, and rejection of array/regex route values.
- **`describe('recordRequestMetric')`** — confirms that `http_requests_total` and `http_request_errors_total` (4xx only) appear in the Prometheus scrape output with the correct label values.
- **`describe('incrementInflight / decrementInflight')`** — exercises the in-flight gauge pair and asserts `http_requests_in_flight` is present in the registry.

## Relationships

- **`src/infrastructure/observability/metrics-http.ts`** — the module under test. The file imports `getRouteLabel`, `UNMATCHED_ROUTE`, `recordRequestMetric`, `incrementInflight`, and `decrementInflight` from it.
- **`src/infrastructure/observability/metrics-registry.ts`** — imported solely for `getPrometheusMetrics()`, which serialises the registry so tests can assert on the exact text Prometheus would scrape.
- **`tests/support/stub.ts`** — provides `asStub<T>`, the lightweight stub factory used to build fake Express `Request` objects without instantiating a real Express instance.

## Notes

- The tests assert against the **full Prometheus text exposition** (`metrics` string) rather than internal counter values, making them sensitive to label ordering and HELP/TYPE lines.
- The `routed` helper intentionally omits most Express properties; it only sets `baseUrl` and `route.path` (or leaves `route` absent). Adding a new assertion that depends on another request property will require extending this stub.
- Cardinality-bounding behaviour (unmatched → single label) is the primary correctness concern documented in the inline comment block; treat the `UNMATCHED_ROUTE` cases as load-bearing, not incidental.
