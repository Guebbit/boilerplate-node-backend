---
source: tests/unit/infrastructure/http/middlewares/request-logger.test.ts
sha256: 98af5790ecb1f2767bdde1c740cc045ecc23cdc9f3d2678f9d60a1adceec55b9
generated_at: 2026-11-08T10:16:43.770132+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/middlewares/request-logger.test.ts

## Purpose

Unit test suite for the `requestLogger` Express middleware. Verifies that the middleware defers logging until the response `finish` event, selects the correct log level based on status code, emits only a slim set of metadata fields (no PII), and guards against duplicate log calls when `finish` fires more than once.

## Key elements

- **`buildRequest(overrides)`** – Returns an `asStub<Request>` with defaults (`GET /products`, `requestId: 'req-1'`) so tests can exercise the middleware without a real Express server.
- **`buildResponse(statusCode)`** – Returns an `asStub<Response>` that wires a tiny in-memory event emitter (`once` + `emit`) so `res.emit('finish')` can be triggered on demand.
- **`describe('requestLogger')`** – Five test cases:
  - Calls `next()` immediately (non-blocking middleware).
  - Does not log before `finish` fires.
  - Parametrized check: 200→`info`, 404→`warn`, 500→`error`.
  - Asserts the metadata object contains exactly `{requestId, traceId, method, route, statusCode, durationMs}` and explicitly that `headers`, `user_id`, `ip`, `userAgent` are absent.
  - Emits `finish` twice and asserts `logger.log` is called only once.
- **`jest.mock` blocks** – Stub out `@infrastructure/adapters/logger` (all four methods), `getRouteLabel` (returns `'/products'`), and `getActiveSpanContext` (returns a fixed `{traceId, spanId}`) so the middleware under test runs in isolation.

## Relationships

- **`src/infrastructure/http/middlewares/request-logger.ts`** – The unit under test; the file imports `requestLogger` and drives it with stubbed request/response/next.
- **`src/infrastructure/adapters/logger.ts`** – Mocked; the test asserts on `logger.log` call arguments (level, message, metadata).
- **`tests/support/stub.ts`** – Provides the `asStub` helper used to construct the `Request` and `Response` fakes.

## Notes

- The `buildResponse` helper intentionally implements only `once`/`emit` for the `'finish'` event—enough surface to simulate the Express lifecycle without pulling in `http` or `stream` types.
- The PII-exclusion assertions (`headers`, `user_id`, `ip`, `userAgent`) encode a project-level logging policy; if the middleware's metadata shape changes, these negative assertions will break first.
- `src/kernel/registry.ts` appears in the dependency graph as a transitive neighbor of the middleware but is not imported or referenced in this test file.
