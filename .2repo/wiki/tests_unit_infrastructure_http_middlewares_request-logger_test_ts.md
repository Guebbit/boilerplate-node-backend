# tests/unit/infrastructure/http/middlewares/request-logger.test.ts

## Purpose

Unit tests for the `requestLogger` Express middleware. Verifies that the middleware is non-blocking, defers logging until the response `finish` event, selects the correct log level by status code, emits only a fixed set of metadata fields, and fires the log call exactly once regardless of how many times `finish` is emitted.

## Key elements

- **`buildRequest(overrides?)`** – Builds a minimal `Request` stub (method, path, originalUrl, requestId) via `asStub`; accepts partial overrides for individual test cases.
- **`buildResponse(statusCode?)`** – Builds a `Response` stub whose `once`/`emit` methods implement a tiny single-listener event bus, allowing tests to simulate the Express `finish` lifecycle event.
- **`describe('requestLogger')`** block – Five test cases:
  - `calls next() immediately` – asserts the middleware does not block the request chain.
  - `does not log before finish` – asserts `logger.log` is not called until `finish` fires.
  - `logs at correct level for status %i (%s)` – parameterised over 200 → `info`, 404 → `warn`, 500 → `error`.
  - `logs only the slim metadata fields` – asserts the metadata object contains exactly `request_id`, `trace_id`, `method`, `route`, `status_code`, `duration_ms` and explicitly that `headers`, `user_id`, `ip`, `user_agent` are absent.
  - `does not log twice when finish fires more than once` – guards against double-logging.

## Relationships

- **`src/infrastructure/http/middlewares/request-logger.ts`** – System under test; imported as `requestLogger` and exercised in every test case.
- **`src/infrastructure/adapters/logger.ts`** – Mocked at the module level (`jest.mock`). Tests assert against `logger.log` to verify log level, payload, and call count.
- **`tests/support/stub.ts`** – Provides `asStub<T>()`, used by both `buildRequest` and `buildResponse` to create lightweight typed object stubs without implementing full Express interfaces.
- `@infrastructure/observability/metrics-http` and `@infrastructure/observability/tracer` are also mocked (route label, trace/span IDs) so the middleware's observability calls are deterministic.

## Notes

- The `buildResponse` stub uses a `Map`-backed listener registry with a `let response` self-reference pattern (eslint-suppressed) so that `once` closures can register on the same object they are defined on.
- The "slim metadata" test is an explicit privacy/PII guard: it asserts the absence of fields that could leak sensitive data (headers, IP, user-agent), not just the presence of expected ones.
- The `duration_ms` value is asserted as `expect.any(Number)` rather than a specific value, since it depends on `Date.now()` inside the middleware.
