---
source: tests/unit/infrastructure/http/middlewares/request-logger.test.ts
sha256: d2850dbdd73b46a8d159bea60d411e7bd38e6bdcbdd2651e12c40baf1cbc85a5
generated_at: 2026-09-23T20:22:24.336392+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/middlewares/request-logger.test.ts

## Purpose

Unit tests for the `requestLogger` Express middleware. They verify that the middleware calls `next()` synchronously, defers logging until the `finish` event fires, selects the correct log level by status code, emits a fixed set of slim metadata fields (no sensitive data), and guards against duplicate logging if `finish` is emitted more than once.

## Key elements

- **`buildRequest(overrides?)`** — Returns a typed `Request` stub (via `asStub`) with sensible defaults (`GET /products`, `requestId: 'req-1'`); callers can override any field.
- **`buildResponse(statusCode = 200)`** — Returns a typed `Response` stub whose `once`/`emit` pair implements a minimal single-fire event emitter for the `'finish'` event, mimicking how Express triggers the middleware's log-on-finish callback.
- **`jest.mock` blocks** — Stub out three external modules so no I/O or observability side-effects occur:
    - `@infrastructure/adapters/logger` — exposes `logger.log` (and `info`/`warn`/`error`) as `jest.fn()`.
    - `@infrastructure/observability/metrics-http` — `getRouteLabel` returns a fixed path.
    - `@infrastructure/observability/tracer` — `getActiveSpanContext` returns fixed `traceId`/`spanId`.
- **Test cases** (inside `describe('requestLogger')`):
    - Calls `next()` immediately (once, synchronously).
    - Does not call `logger.log` before `finish` is emitted.
    - `it.each` mapping: 200 → `info`, 444 → `warn`, 500 → `error`.
    - Asserts the metadata object contains exactly `request_id`, `trace_id`, `method`, `route`, `status_code`, `duration_ms` and explicitly **excludes** `headers`, `user_id`, `ip`, `user_agent`.
    - Double-emitting `'finish'` still results in exactly one `log` call.

## Relationships

| Neighbor                                                | Interaction                                                                                                                          |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `src/infrastructure/http/middlewares/request-logger.ts` | System under test; `requestLogger` is imported and invoked in every case.                                                            |
| `src/infrastructure/adapters/logger.ts`                 | Fully mocked; `logger.log` is the sole spy the tests assert against.                                                                 |
| `tests/support/stub.ts`                                 | Provides the `asStub<T>()` helper used to create type-safe `Request` and `Response` stubs without pulling in real Express instances. |

> `src/kernel/registry.ts` appears as a graph neighbor but has no visible import, mock, or interaction in this file.

## Notes

- The response stub's event emitter is intentionally minimal: `once` registers a handler, `emit` invokes all registered handlers **once** and then deletes the list. This mirrors the middleware's expectation that `finish` fires at most once, but the test that double-emits relies on the middleware's own idempotency guard, not the stub's.
- `asStub` casts an object literal to the target type, so TypeScript does not require a full Express implementation—only the fields the middleware actually reads.
- The test does **not** exercise the `info`/`warn`/`error` logger methods directly; it asserts the _first argument_ passed to `logger.log` (the level string), meaning the middleware funnels all levels through a single `log(level, …)` call.
