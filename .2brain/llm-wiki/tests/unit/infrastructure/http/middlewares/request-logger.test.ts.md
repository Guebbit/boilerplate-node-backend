---
source: tests/unit/infrastructure/http/middlewares/request-logger.test.ts
sha256: 98af5790ecb1f2767bdde1c740cc045ecc23cdc9f3d2678f9d60a1adceec55b9
generated_at: 2026-10-15T13:14:33.024643+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/middlewares/request-logger.test.ts

## Purpose

Unit tests for the `requestLogger` HTTP middleware. Verifies that the middleware is non-blocking, defers logging until the response `finish` event, selects the correct log level by status code, emits only a fixed set of metadata fields (no PII), and guards against duplicate log emissions.

## Key elements

- **`buildRequest(overrides?)`** – Factory that returns a typed `Request` stub (via `asStub`) with sensible defaults (`method: 'GET'`, `path: '/products'`, `requestId: 'req-1'`). Used to feed controlled inputs to the middleware.
- **`buildResponse(statusCode?)`** – Factory that returns a typed `Response` stub with a minimal in-memory event emitter (`once` / `emit`). Lets tests fire the `finish` event deterministically without a real Express server.
- **`describe('requestLogger')`** – The test suite, containing:
  - *calls next() immediately* – asserts the middleware is synchronous/pass-through.
  - *does not log before finish* – asserts `logger.log` is not invoked until the response completes.
  - *logs at correct level for status %i (%s)* – parametric check: 200 → `info`, 404 → `warn`, 500 → `error`.
  - *logs only the slim metadata fields* – asserts the metadata object contains exactly `requestId`, `traceId`, `method`, `route`, `statusCode`, `durationMs`; explicitly asserts absence of `headers`, `user_id`, `ip`, `userAgent`.
  - *does not log twice when finish fires more than once* – idempotency guard.
- **Mocks (top-level `jest.mock`)** – `logger` (from `@infrastructure/adapters/logger`), `getRouteLabel` (from `@infrastructure/observability/metrics-http`), and `getActiveSpanContext` (from `@infrastructure/observability/tracer`) are all replaced with jest fns before import.

## Relationships

- **`src/infrastructure/http/middlewares/request-logger.ts`** – The module under test; imported and invoked directly with the request/response/next triple.
- **`src/infrastructure/adapters/logger.ts`** – Mocked at module level so `logger.log` can be spied on; the tests assert on call count, log level (first arg), and metadata shape (third arg).
- **`tests/support/stub.ts`** – Provides `asStub<T>()`, the generic helper used to build the `Request` and `Response` test doubles without pulling in Express internals.

## Notes

- The `buildResponse` helper implements `once`/`emit` by hand (a `Map<string, handler[]>`), so tests never need a running Express app. The `emit` call removes handlers after firing, mimicking Node's `once` semantics.
- The `let response` / self-assignment pattern inside `buildResponse` is intentional: the stub's `once`/`emit` closures need to reference the object being constructed. An `eslint-disable-next-line prefer-const` documents this.
- `requestId` is a plain property on the `Request` stub; the middleware is expected to read it from there (not from a header). If the middleware's contract changes to read from `req.headers['x-request-id']`, the `buildRequest` default must be updated accordingly.
- `src/kernel/registry.ts` appears in the dependency graph but is **not** imported by this test file; it has no direct interaction here.
