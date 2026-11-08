---
source: tests/unit/infrastructure/observability/metrics-registry.test.ts
sha256: 58456a5260c7a175eccdea7cbad0fd21bd216ab14dbfa8c9e36af053abc55577
generated_at: 2026-11-08T10:21:18.343389+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/observability/metrics-registry.test.ts

## Purpose

Unit tests for `getPrometheusMetrics`, verifying that standard prom-client families, job-level gauges (`job_last_success_timestamp_seconds`, `job_last_run_timestamp_seconds`), and module-level labelled counters are emitted correctly — including their behavior when MongoDB is disconnected or the lease query throws.

## Key elements

- **`withReadyState(state)`** — local helper that redefines `connection.readyState` in place (no real DB connection). Same pattern used in `dependency-health.test.ts`.
- **`getPrometheusMetrics — standard families`** — asserts `process_uptime_seconds` and `nodejs_eventloop_lag_seconds` appear in the rendered output.
- **`job_last_success_timestamp_seconds`** block — verifies the gauge is skipped (not queried) when `readyState === 0`, emits one series per job with a non-null `lastSuccessAt`, and resolves the scrape (rather than rejecting) if `listLeaseSummaries` throws.
- **`job_last_run_timestamp_seconds`** block — same skip/failure semantics, plus a case confirming a job that ran but never succeeded appears in the *run* gauge but is absent from the *success* gauge.
- **`labelled alert counters`** block — dynamically imports `security-events`, `account/metrics`, `payments/metrics`, `payments/audit`, and `observability/audit` to trigger counter registration, then asserts each labelled counter is present at value `0` (so a Prometheus `increase()` alert fires on the first post-restart event).

## Relationships

- **`src/infrastructure/observability/metrics-registry.ts`** — the unit under test; provides `getPrometheusMetrics`.
- **`src/infrastructure/persistence/lease.ts`** — mocked; `listLeaseSummaries` is the sole data source for the job gauges.
- **`src/infrastructure/runtime/database.ts`** — `connection.readyState` is rewritten to simulate connected (1) vs. disconnected (0) Mongo without a live driver.

## Notes

- The "labelled alert counters" test uses **dynamic `import()`** so that each module's top-level side-effect (counter registration) runs in the current test context; omitting an import silently drops its assertions.
- Query-failure tests assert the scrape still **resolves** with the remaining families intact — a regression to `reject` would break the `/metrics` endpoint.
- Epoch timestamps in assertions are hard-coded to 2026 dates (`1767225600`, etc.); if the mock data changes, both the input `Date` and the expected integer must be updated together.
- `mockedListLeaseSummaries` is reset in each `afterEach`; forgetting a reset can leak a resolved/rejected value into the next test.
