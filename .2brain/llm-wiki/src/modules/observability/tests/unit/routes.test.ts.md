---
source: src/modules/observability/tests/unit/routes.test.ts
sha256: 134d2680c9992d9fbe2732e1c6d21610ef76f6f2581bb226b260a5bf477081f6
generated_at: 2026-09-23T18:59:09.156652+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/tests/unit/routes.test.ts

## Purpose

Unit tests for the observability route table and its two inline handlers (`GET /events` SSE stream, `GET /metrics` Prometheus scrape). Because the handlers live inline in `routes.ts` rather than in a separate controller, the tests reach them by walking the Express router's `stack` and verify guard wiring, response behavior, and the critical error path where `/metrics` must still emit a parseable exposition.

## Key elements

- **`handlerFor(signature)`** — Locates a route by `"METHOD /path"` and returns the last (inline) handler on its stack. Throws if the route is absent.
- **`fakeResponse()`** — Builds a minimal Express `Response` double that records `headers`, `status`, and `body` into a plain object, used to assert what each handler writes.
- **`cookieRequest()`** — Returns a stubbed `Request` carrying `{ cookies: { jwt: 'cookie.jwt' } }` for the SSE route tests.
- **`describe('…what is mounted')`** — Asserts the exact route signature list and that `/metrics` is declared before `/metrics/overview`.
- **`describe('…the two guard styles')`** — Verifies `/events` uses `requirePermissionViaCookieGuard`, `/metrics` uses `isMetricsScraper`, all other endpoints use the standard admin chain, and no route is left unguarded.
- **`describe('GET /observability/events …')`** — Confirms the handler delegates the raw response + a recheck function to `streamObservabilityMetrics` without writing to the response itself, and that the recheck calls `stillHoldsKeyViaCookie` with the request, the cookie value, and the `platform.observability.any.read` permission.
- **`describe('GET /observability/metrics …')`** — Confirms the happy path sets the registry's `contentType` and sends the exposition; the error path returns `500` with a valid Prometheus comment line (`# metrics unavailable`); and the failure is logged via `logger.error` with the full `Error` object (not a flattened string).

## Relationships

- **`src/modules/observability/routes.ts`** — System under test; the test imports its `router` and introspects the stack.
- **`src/modules/observability/services/stream.ts`** — `streamObservabilityMetrics` is fully mocked; tests assert how the inline handler calls it (args, recheck wiring).
- **`src/infrastructure/observability/metrics-registry.ts`** — Partially mocked (`getPrometheusMetrics` replaced, `metricsRegistry` kept real). Tests assert the content type comes from the live registry and that the error path does not depend on it.
- **`src/kernel/middlewares/authorizations.ts`** — Partially mocked (`stillHoldsKeyViaCookie` replaced; sibling guards stay real so `guardsOn` reads their actual names).
- **`src/infrastructure/adapters/logger.ts`** — Fully mocked; tests assert the exact shape of the `logger.error` call.
- **`tests/support/routes.ts`** — Provides `routeSignatures`, `guardsOn`, and `routeTable` helpers used throughout.
- **`tests/support/stub.ts`** — Provides `asStub<T>` for casting test doubles into typed Express interfaces.

## Notes

- **Partial mocks are deliberate and load-bearing.** `metricsRegistry` is kept real because other modules call `new Counter({ registers: [metricsRegistry] })` at import time; a stub registry would make that constructor throw before the suite's first assertion. The same logic keeps most of `authorizations` real so `guardsOn` still sees the true function names.
- **The `/metrics` error body is a Prometheus exposition comment, not an error page.** If it were an HTML/JSON error body, the scraper would log a format error on top of the outage and the series would stop.
- **The SSE handler must not touch the response.** Any `send`/`status` call before the stream begins would close the connection prematurely; tests assert `recorded.body` and `recorded.status` remain `undefined`.
- **Route ordering is tested as a convention, not just a correctness check.** `/metrics` before `/metrics/overview` is the file's stated rule; the pair is the one spot where a future parameterised route (`/metrics/:name`) would silently shadow the overview endpoint.
- **Logging assertion passes the `Error` object, not `.message`.** The downstream `redactFormat` → `serializeError` pipeline preserves the name and (non-prod) stack; flattening to a string in the test would incorrectly assert that context is discarded.
