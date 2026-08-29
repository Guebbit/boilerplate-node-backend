# src/modules/observability/tests/unit/routes.test.ts

## Purpose
Unit tests for the observability router (`routes.ts`). Verifies the mounted route table, the distinct auth-guard strategy per route, and the behaviour of the two inline handlers (SSE stream hand-off and Prometheus scrape, including the error path). The file exists because those handlers are written inline in `routes.ts` rather than in a separate controller module, so they cannot be imported and tested in isolation.

## Key elements
- **`handlerFor(signature)`** – Walks the router's Express layer stack, finds the route matching `signature` (e.g. `"GET /events"`), and returns the last `handle` function (the inline handler, past its guard).
- **`fakeResponse()`** – Builds a minimal `Response` double that records `headers`, `status`, and `body` via `setHeader`/`status`/`send`.
- **`describe('what is mounted')`** – Asserts the exact route signature list and ordering; confirms `/metrics` precedes `/metrics/overview`.
- **`describe('the two guard styles')`** – Asserts `isAdminViaCookie` on `/events`, `isMetricsScraper` on `/metrics`, the ordinary `getAuth`→`isAuth`→`isAdmin` chain on the remaining three routes, and that no route is unguarded.
- **`describe('GET /observability/events')`** – Asserts the handler delegates the raw `response` to `streamObservabilityMetrics` and writes nothing itself.
- **`describe('GET /observability/metrics')`** – Asserts success path (content-type from `metricsRegistry.contentType`, body from `getPrometheusMetrics`), failure path (500 + valid empty exposition `# metrics unavailable\n`), and that `logger.error` is called with the failure message.

## Relationships
- **`src/modules/observability/routes.ts`** – The file under test; `router` is imported and its Express stack is introspected.
- **`src/infrastructure/observability/stream.ts`** – Fully mocked; `streamObservabilityMetrics` is spied to verify the SSE handler delegates to it.
- **`src/infrastructure/observability/metrics-http.ts`** – Partially mocked via `jest.requireActual`: `getPrometheusMetrics` is replaced, but `metricsRegistry` is kept **real** so that module-level `new Counter({ registers: [metricsRegistry] })` calls at import time do not throw.
- **`src/infrastructure/adapters/logger.ts`** – Fully mocked; `logger.error` is spied on the scrape-failure path.
- **`tests/support/routes.ts`** – Provides `routeSignatures`, `guardsOn`, and `routeTable` helpers used throughout the suite.
- **`tests/support/stub.ts`** – Provides `asStub` for safe type-casting of the router's internal stack and the fake response.

## Notes
- **`metricsRegistry` is deliberately not stubbed.** Stubbing it would make `new Counter({ registers: [metricsRegistry] })` throw at import time in dependent modules, before any test runs. Keeping it real also means the asserted `Content-Type` is the one the client library actually negotiates.
- **Async flushing:** The metrics handler is async; tests use consecutive `await Promise.resolve()` calls (two for success, three for the rejection path) to drain the microtask queue before asserting on the recorded response.
- **Guard assertion uses `guardsOn`**, which lists middleware names in stack order. The inline handler appears as `'(anonymous)'` because it has no exported name.
- **Error-path body must parse as a Prometheus exposition.** The test asserts the literal string `# metrics unavailable\n` (a valid exposition comment), not an HTML/JSON error body, to document the contract that a scrape failure must not produce an unparseable response.
