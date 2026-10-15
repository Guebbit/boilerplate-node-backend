---
source: tests/unit/infrastructure/observability/metrics-registry.test.ts
sha256: 570701d256f19fcb1c491c9fd0196fb82e728968201fea0429dadd73ddf26502
generated_at: 2026-10-15T13:17:36.285530+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/observability/metrics-registry.test.ts

## Purpose

Unit tests for `getPrometheusMetrics`, verifying that the scrape output contains the expected standard families, that job timestamp gauges behave correctly across connection states and query failures, and that labelled alert counters are registered at zero from the start.

## Key elements

- **`withReadyState(state: number)`** — Helper that redefines `connection.readyState` on the shared `connection` object without opening a real database. Same pattern as `dependency-health.test.ts`.
- **`describe('standard families')`** — Asserts `process_uptime_seconds` and `nodejs_eventloop_lag_seconds` are present in the scrape text.
- **`describe('job_last_success_timestamp_seconds — D9')`** — Covers three cases: (1) gauge is omitted and `listLeaseSummaries` is never called when `readyState` is 0; (2) one series per job with a non-null `lastSuccessAt`, omitted when undefined; (3) a rejected query degrades to "no series" rather than rejecting the entire scrape.
- **`describe('job_last_run_timestamp_seconds')`** — Same three patterns plus a distinguishing case: a job that has run but never succeeded appears in the run gauge but is absent from the success gauge.
- **`describe('labelled alert counters')`** — Dynamically imports `security-events`, `account/metrics`, and `payments/metrics` to register their counters, then asserts each starts at `0` so a Prometheus `increase()` alert fires on the first event after restart.

## Relationships

- **`src/infrastructure/observability/metrics-registry.ts`** — System under test; exports `getPrometheusMetrics`.
- **`src/infrastructure/persistence/lease.ts`** — Mocked module; `listLeaseSummaries` is the data source the registry calls to build the job timestamp gauges.
- **`src/infrastructure/runtime/database.ts`** — Provides the `connection` singleton whose `readyState` the registry checks before issuing the lease query; the `withReadyState` helper mutates this property directly.

## Notes

- The `afterEach` in each job-gauge block calls `mockReset()` to prevent cross-test leakage of resolved/rejected values.
- The "D9" label in the success-gauge describe block is a cross-reference to a design decision (see project decision log); it is not a test framework concept.
- The alert-counters test relies on side-effect imports to trigger counter registration; the scrape must happen *after* those imports resolve.
- The resilience contract (query failure → partial scrape, not a rejection) is tested identically for both gauges; a regression in either would break Prometheus scraping for all other metric families.
