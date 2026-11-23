---
source: src/modules/observability/tests/unit/get-observability-metrics.test.ts
source_sha256: ec7d9e34dacb5146a826f293846bd07959e4dc8ec177e58defc10576b0a41c26
context_sha256: 6759a6aeb8abcbc95b80d860592cf197190fed26baa893ff6081c5b335611ae1
generated_at: 2026-11-22T06:05:01.826664+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/observability/tests/unit/get-observability-metrics.test.ts

## Purpose
Unit tests for the `GET /observability/metrics` Prometheus scrape handler (`getObservabilityMetrics`). They cover the success path and a failed collection. On failure, the handler must still answer with a valid empty exposition body rather than an error page, because a scraper would otherwise log a format error on top of the outage.

## Key elements
- **Module mocks**
  - `@infrastructure/observability/metrics-registry` is partially mocked. Only `getPrometheusMetrics` is replaced with `jest.fn()`. `metricsRegistry` stays real via `jest.requireActual`.
  - `recordErrorOnActiveSpan` in the tracer is mocked.
  - `logger` is mocked with `info`, `warn` and `error` as `jest.fn()`.
- **`fakeResponse()`** builds a minimal Express `Response` double. It implements `setHeader`, `send` and `status` (the last two chainable) and records headers, status and body. It is cast with `asStub`.
- **Tests**
  1. Success: `Content-Type` equals `metricsRegistry.contentType`, the body is the collected exposition, and no status is set.
  2. Failed collection: status 500, the same `Content-Type`, and body `'# metrics unavailable\n'`.
  3. Failed collection: `logger.error` is called with `'Failed to collect Prometheus metrics'` and `{ error: failure }`, where `failure` is the original `Error` object.
  4. Failed collection: `recordErrorOnActiveSpan` is called with the thrown error.
- `beforeEach` runs `jest.clearAllMocks()`.

## Relationships
- Tests `getObservabilityMetrics` from `src/modules/observability/controllers/get-observability-metrics.ts`.
- `src/infrastructure/observability/metrics-registry.ts` supplies the real `metricsRegistry` (for `contentType`). Its `getPrometheusMetrics` is stubbed to resolve or reject.
- `src/infrastructure/observability/tracer.ts` has `recordErrorOnActiveSpan` mocked, to assert the span is marked failed.
- `src/infrastructure/adapters/logger.ts` has `logger` mocked, to assert the error log call.
- `tests/support/stub.ts` supplies `asStub`, used for the response double and the dummy request.

## Notes
- The registry is kept real on purpose. Other modules register counters against it at import time, so a fully stubbed registry would throw before any assertion ran. It also means the asserted content type is the one the client library actually negotiates.
- The handler is called without being awaited, so each test flushes microtasks with `await Promise.resolve()` (two ticks on success, three on failure). Changing the number of async hops in the handler can break these tests.
- The log assertion expects the `Error` object itself, not its message. The comment says `redactFormat` passes anything under `error` to `serializeError`, which keeps the name and, outside production, the stack.
