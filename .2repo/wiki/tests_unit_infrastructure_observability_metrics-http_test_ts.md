# tests/unit/infrastructure/observability/metrics-http.test.ts

## Purpose

Unit tests for the HTTP request metrics module (`metrics-http.ts`). Validates that route labels are derived safely (bounded cardinality), that Prometheus counters/gauges are incremented correctly, and that histogram-percentile math behaves as expected.

## Key elements

- **`routed` (local helper)** — builds a minimal Express `Request` stub via `asStub` carrying `baseUrl` and an optional `route.path`. The single test-utility used across every `getRouteLabel` case.
- **`describe('getRouteLabel')`** — four cases: named template returned verbatim; router-root slash normalization; unmatched paths collapse to `UNMATCHED_ROUTE`; array/regex routes also map to `UNMATCHED_ROUTE`.
- **`describe('recordRequestMetric')`** — asserts `http_requests_total`, `http_request_errors_total` (4xx only), and that 2xx does *not* produce an error series. Verifies via `getPrometheusMetrics()` text output.
- **`describe('incrementInflight / decrementInflight')`** — smoke-checks that `http_requests_in_flight` appears in the exported metric text.
- **`describe('getPrometheusMetrics — standard families')`** — confirms `process_uptime_seconds` and `nodejs_eventloop_lag_seconds` are present in the rendered output.
- **`describe('percentileFromHistogramBuckets')`** — edge case (empty array → 0) and two percentile lookups (p50, p95) over a three-bucket fixture.

## Relationships

- **`src/infrastructure/observability/metrics-http.ts`** — the module under test; every import in this file (`getRouteLabel`, `UNMATCHED_ROUTE`, `recordRequestMetric`, `incrementInflight`, `decrementInflight`, `getPrometheusMetrics`, `percentileFromHistogramBuckets`) comes from it.
- **`tests/support/stub.ts`** — provides `asStub`, used by the local `routed` helper to construct typed `Request` objects without a real Express server.

## Notes

- **Cardinality is the central concern.** Unmatched routes, array paths, and regex routes all map to the single `UNMATCHED_ROUTE` label so that a scanner hitting thousands of random paths does not create unbounded time series. Tests exist specifically to lock this behavior.
- **No server or HTTP calls.** Metrics are recorded in-process and read back as Prometheus text format (`getPrometheusMetrics()` returns a string); assertions are string-containment checks, not numeric comparisons on counter values.
- **`percentileFromHistogramBuckets` is tested in isolation** with a flat array of `{ upperBound, cumulativeCount }` objects — no dependency on a running Prometheus registry.
