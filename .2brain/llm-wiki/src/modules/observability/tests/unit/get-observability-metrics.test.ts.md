---
source: src/modules/observability/tests/unit/get-observability-metrics.test.ts
sha256: 75516643fa0128ca436585f9f1c532c94f178bf1fcdaede8c95662f1fcbe633b
generated_at: 2026-11-14T20:30:51.142884+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/tests/unit/get-observability-metrics.test.ts

## Purpose
Unit tests for the `GET /observability/metrics` Prometheus scrape handler. Covers the happy path (valid exposition body + registry content type) and the failure path (typed 500 with a comment-line body), plus side effects: structured error logging and span failure marking.

## Key elements
- **`fakeResponse()`** – builds a minimal Express `Response` double that records `setHeader`, `status`, and `send` calls so assertions can inspect them without a full HTTP stack.
- **`jest.mock` for `metrics-registry`** – partial mock: only `getPrometheusMetrics` is stubbed; `metricsRegistry` is kept real (see Notes).
- **`jest.mock` for `tracer`** – replaces `recordErrorOnActiveSpan` with a spy.
- **`jest.mock` for `logger`** – replaces the logger object with `info`/`warn`/`error` spies.
- **Test cases** (four):
  - *happy path* – asserts `Content-Type` equals `metricsRegistry.contentType`, body is the mocked exposition string, and no status code is set.
  - *failed collection* – asserts `status(500)`, same content type, and body is the literal `'# metrics unavailable\n'`.
  - *logging* – asserts `logger.error` receives the Error **object** under the `error` key, not a flattened string.
  - *span marking* – asserts `recordErrorOnActiveSpan` is called with the Error instance.

## Relationships
- **`@modules/observability/controllers/get-observability-metrics`** – the system under test; imported directly and called synchronously (the handler is async internally but the call is fire-and-forget, flushed via microtask ticks before assertions).
- **`@infrastructure/observability/metrics-registry`** – `getPrometheusMetrics` is mocked; `metricsRegistry` (real) is used to assert the content type.
- **`@infrastructure/observability/tracer`** – `recordErrorOnActiveSpan` is spied on to verify the failure is propagated to tracing.
- **`@infrastructure/adapters/logger`** – spied on to verify structured error logging.
- **`tests/support/stub`** – `asStub` is used to cast plain objects into typed parameters without `as unknown as` chains.

## Notes
- **`metricsRegistry` must stay real.** Stubbing it would break every module that calls `new Counter({ registers: [metricsRegistry] })` at import time, throwing before any test runs. It also ensures the content-type assertion reflects what the client library actually negotiates.
- **Content type is asserted via the live registry**, never hardcoded, so a client-library format change is caught immediately.
- **The error is passed as an `Error` instance**, not `.message` — the production code hands it to `serializeError`, which preserves name and (non-prod) stack. Asserting a string would encode a different contract.
- **Async flushing** uses successive `await Promise.resolve()` calls rather than `await`-ing the handler directly, because the controller is not `async`-annotated at its call site.
