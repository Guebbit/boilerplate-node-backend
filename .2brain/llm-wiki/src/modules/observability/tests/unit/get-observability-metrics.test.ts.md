---
source: src/modules/observability/tests/unit/get-observability-metrics.test.ts
sha256: 2ec0be6ea8986276588f638cf5abdb7432c9960c468289e9c7ab85e71219408f
generated_at: 2026-09-27T15:06:11.405188+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/tests/unit/get-observability-metrics.test.ts

## Purpose

Unit tests for the `GET /observability/metrics` Prometheus scrape handler. Covers the happy path (exposition body + registry content type), the failure path (500 + valid empty exposition comment), and the error-logging contract. Exists to guarantee that a collection failure still returns a body a Prometheus scraper can parse, avoiding a secondary format-error log on top of the outage.

## Key elements

- **`fakeResponse()`** — builds a minimal Express `Response` double that records `setHeader`, `send`, and `status` calls into a plain `recorded` object; returns `{ response: asStub<Response>(…), recorded }`.
- **Partial mock of `metrics-registry`** — replaces only `getPrometheusMetrics` with a `jest.fn()`; spreads `jest.requireActual` so the real `metricsRegistry` singleton (and its `contentType`) remain available for assertions.
- **Mock of `logger`** — replaces the entire adapter with no-op `info`/`warn`/`error` spies.
- **Three test cases** (under `describe('GET /observability/metrics')`):
  1. Happy path — asserts `Content-Type` equals `metricsRegistry.contentType`, body is the mocked exposition string, and `status` is never called.
  2. Failure path — asserts `status(500)` and body is exactly `'# metrics unavailable\n'`.
  3. Failure logging — asserts `logger.error` received the message *and* the `Error` instance under an `error` key (not a flattened string).

## Relationships

- **`src/modules/observability/controllers/get-observability-metrics.ts`** — the system under test; the handler is invoked directly with a null request stub and the fake response.
- **`src/infrastructure/observability/metrics-registry.ts`** — `getPrometheusMetrics` is the seam being stubbed; the real `metricsRegistry.contentType` is read in assertions to avoid hardcoding a content-type string.
- **`src/infrastructure/adapters/logger.ts`** — fully mocked; one test verifies the exact `error` call signature.
- **`tests/support/stub.ts`** — provides `asStub` to cast the hand-rolled response object to `Response` without runtime cost.

## Notes

- `metricsRegistry` is deliberately **not** stubbed. Modules register counters against the real registry at import time; a stub registry would make `new Counter({ registers: [metricsRegistry] })` throw before the suite's first assertion.
- The failure-body assertion (`'# metrics unavailable\n'`) enforces that the response is still a valid Prometheus exposition (a comment line), not an HTML/JSON error page.
- The logger assertion passes the `Error` object itself (not `.message`), because the production `redactFormat` → `serializeError` pipeline relies on receiving the instance to preserve `name` and (non-prod) `stack`.
- Two `await Promise.resolve()` microtask ticks are needed to flush the happy-path async handler; three are needed for the failure path (the `catch` adds one more microtask).
