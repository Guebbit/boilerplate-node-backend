---
source: tests/unit/infrastructure/observability/metrics-registry.test.ts
sha256: da301e33c6e73a7cbf277528f71be0f17a8de427801cef6e968881612483c12b
generated_at: 2026-09-27T16:08:56.065838+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/observability/metrics-registry.test.ts

## Purpose

Unit tests for `getPrometheusMetrics`, verifying that the Prometheus scrape output includes expected metric families and that the `job_last_success_timestamp_seconds` metric behaves correctly across Mongo connection states and query failures.

## Key elements

- **`withReadyState(state)`** — local helper that overrides `connection.readyState` via `Object.defineProperty` so tests can simulate Mongo connected/disconnected without opening a real socket.
- **`jest.mock('@infrastructure/persistence/lease', …)`** — replaces `listLeaseSummaries` with a `jest.fn()` so lease queries are controlled per-test.
- **`describe('getPrometheusMetrics — standard families')`** — asserts `process_uptime_seconds` and `nodejs_eventloop_lag_seconds` appear in the output.
- **`describe('job_last_success_timestamp_seconds — D9')`** — three cases: (1) skips the query entirely when `readyState` is 0, (2) emits one series per job that has a `lastSuccessAt` and omits jobs that never succeeded, (3) a rejected query resolves the scrape with all other metrics intact (no throw).

## Relationships

- **`src/infrastructure/observability/metrics-registry.ts`** — the module under test; the test imports and exercises its exported `getPrometheusMetrics`.
- **`src/infrastructure/persistence/lease.ts`** — dependency mocked at module level; `listLeaseSummaries` is the only symbol the test stubs from this file.
- **`src/infrastructure/runtime/database.ts`** — provides `connection`; the test reads and overrides `connection.readyState` to gate the lease query.

## Notes

- The `withReadyState` helper is intentionally duplicated (not shared) with `dependency-health.test.ts` to keep each test file self-contained; see the comment in the source.
- The "resolves rather than rejects" test encodes a deliberate design choice: a lease-query failure must not poison the entire `/metrics` scrape.
- `job_last_success_timestamp_seconds` is labeled **D9** in the describe block, referencing a design-decision identifier used elsewhere in the codebase.
