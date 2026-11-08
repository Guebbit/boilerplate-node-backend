---
source: src/modules/observability/tests/unit/get-observability-metrics.test.ts
sha256: 2ec0be6ea8986276588f638cf5abdb7432c9960c468289e9c7ab85e71219408f
generated_at: 2026-11-08T06:42:56.672134+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/tests/unit/get-observability-metrics.test.ts

## Purpose

Unit test for the `GET /observability/metrics` Prometheus scrape handler. It verifies two contract guarantees: a successful collection returns the registry's negotiated content type and exposition body, and a failed collection still returns a 500 with a syntactically valid (empty) exposition so scrapers don't log a secondary format error.

## Key elements

- **`fakeResponse()`** — factory returning a minimal Express `Response` double (via `asStub<Response>`) that records `headers`, `status`, and `body` so assertions can inspect what the handler actually wrote.
- **Partial mock of `@infrastructure/observability/metrics-registry`** — spreads `jest.requireActual` then overrides only `getPrometheusMetrics` with `jest.fn()`. The real `metricsRegistry` singleton stays live.
- **Mock of `@infrastructure/adapters/logger`** — replaces the module with `{ logger: { info, warn, error } }` as `jest.fn()`s.
- **`describe('GET /observability/metrics')`** — three `it` cases: happy path (content type + body + no status set), failure path (500 + `# metrics unavailable\n`), and failure logging (asserts `logger.error` receives the `Error` object under the `error` key).

## Relationships

- **`src/modules/observability/controllers/get-observability-metrics.ts`** — the system under test; imported and invoked as `getObservabilityMetrics(req, res)`.
- **`src/infrastructure/observability/metrics-registry.ts`** — `getPrometheusMetrics` is the jest.fn() the tests mock; `metricsRegistry.contentType` is read as the expected header value.
- **`src/infrastructure/adapters/logger.ts`** — mocked so the failure-path test can assert `logger.error` was called with the correct argument shape.
- **`tests/support/stub.ts`** — provides the `asStub<T>()` type-assertion helper used to satisfy Express's `Response` type on the hand-rolled fake.

## Notes

- The real `metricsRegistry` is **deliberately kept unmocked**: every module that imports a counter calls `new Counter({ registers: [metricsRegistry] })` at import time, so a stub registry would throw before the first assertion. It also means the content-type assertion checks the value the client library actually negotiates.
- The async handler is not `await`ed directly. Tests instead drain the microtask queue with one or two extra `await Promise.resolve()` calls (three in the failure path, where the catch block adds another tick).
- The logger assertion passes the `Error` object itself (not `.message`) so that `redactFormat` → `serializeError` can include the name and, outside production, the stack. Flattening to a string here would silently discard both.
