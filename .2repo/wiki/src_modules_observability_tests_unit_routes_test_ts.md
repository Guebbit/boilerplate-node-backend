# src/modules/observability/tests/unit/routes.test.ts

## Purpose

Unit tests for the observability router and its two inline handlers (`GET /events`, `GET /metrics`). The handlers are not separately exported from `routes.ts`, so the suite drives them through the Express router stack. The file also asserts the route table's shape, ordering, and the distinct authentication guard applied to each endpoint.

## Key elements

- **`handlerFor(signature)`** — walks the Express router stack to extract the last (inline) handler for a given `METHOD /path` signature.
- **`fakeResponse()`** — returns a minimal Express `Response` double that records `setHeader`, `status`, and `send` into a `recorded` object.
- **Mock setup** — `streamObservabilityMetrics` is fully mocked; `getPrometheusMetrics` is mocked while `metricsRegistry` stays real; `logger` is fully mocked.
- **"what is mounted"** — asserts the exact route signature list and that `/metrics` appears before `/metrics/overview`.
- **"the two guard styles"** — verifies `isAdminViaCookie` on `/events`, `isMetricsScraper` on `/metrics`, the standard `getAuth`/`isAuth`/`isAdmin` chain on remaining routes, and that no endpoint is left unguarded.
- **"GET /events handler"** — confirms the handler delegates the response to `streamObservabilityMetrics` and writes no body/status itself.
- **"GET /metrics handler"** — asserts correct `Content-Type` (from the real registry), the exposition body, the 500 + `# metrics unavailable\n` error branch, and the `logger.error` call on failure.

## Relationships

- **`src/modules/observability/routes.ts`** — the system under test; provides the `router` whose stack is inspected.
- **`src/infrastructure/observability/stream.ts`** — `streamObservabilityMetrics` is mocked; the test asserts the SSE handler forwards the raw response to it.
- **`src/infrastructure/observability/metrics-http.ts`** — partially mocked (`getPrometheusMetrics` stubbed, `metricsRegistry` kept real) so the asserted `Content-Type` reflects the actual client library.
- **`src/infrastructure/adapters/logger.ts`** — mocked; the suite verifies `logger.error` is called with the collection failure message.
- **`tests/support/routes.ts`** — supplies `routeSignatures`, `guardsOn`, and `routeTable` helpers used throughout the suite.
- **`tests/support/stub.ts`** — supplies `asStub` for type-safe casting of the router stack and response double.

## Notes

- `metricsRegistry` is intentionally **not** stubbed: every module registers counters against it at import time, so a fake registry would cause `new Counter({ registers: [metricsRegistry] })` to throw before any assertion runs. Keeping it real also makes the `Content-Type` assertion meaningful.
- The inline handlers are reached by index into `route.stack` (last element), not by name — there is no separate import to test against.
- The async `/metrics` handler is invoked without `await`; the tests flush microtasks with successive `await Promise.resolve()` calls (two for the success path, three for the error path which adds an extra `.catch`).
- The `/metrics` error branch must emit a syntactically valid exposition (`# metrics unavailable\n`), not a JSON/HTML error body, so the Prometheus scraper does not log a format error on top of the outage.
