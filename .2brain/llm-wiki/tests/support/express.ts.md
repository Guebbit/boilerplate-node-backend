---
source: tests/support/express.ts
sha256: f9147adb8609f603f92e73346c6e923aac49fb663034f5b858469372c2cae14d
generated_at: 2026-11-08T09:54:38.567362+00:00
model: ollama:qwen3.8:27b
---

# tests/support/express.ts

## Purpose

Provides a chainable Express `Response` stub for unit tests that assert on what a middleware, error responder, or controller wrote to the response. It exists so tests can inspect `status()`, `json()`, and header calls without spinning up a server, while deliberately NOT covering routing, the full middleware chain, or global error handling (that belongs to `tests/support/http.ts`).

## Key elements

- **`ResponseStub`** (type) — `express.Response` extended with `status`, `json`, `end`, `setHeader`, `hasHeader`, `getHeader`, and `removeHeader` typed as `jest.Mock`. Keeps the mock type visible so tests can assert on call order and count, not just the final payload.
- **`makeResponseStub()`** (exported function) — Builds and returns a `ResponseStub`. Wires `status`, `json`, and `end` to `mockReturnValue` the response itself so fluent chains like `res.status(404).json(body)` don't throw. Header methods are backed by a `Map<string, unknown>` keyed on lower-cased names, so `hasHeader`/`getHeader`/`removeHeader` answer truthfully across calls.

## Relationships

- **`tests/support/stub.ts`** — Provides `asStub`, the generic helper that casts a partial object to a fully-mocked type. `makeResponseStub` delegates to it.
- **Consumer test files** (e.g. `error-handling.test.ts`, `human-challenge.test.ts`, `idempotency.test.ts`, `upload.test.ts`, `response.test.ts`, `create-update-controller.test.ts`, `authorizations.test.ts`, `step-up.test.ts`, `metrics-scraper.test.ts`) — Import `makeResponseStub` (and the `ResponseStub` type) to pass as the `res` argument when unit-testing a single middleware or controller function in isolation.

## Notes

- **Fluent chaining is load-bearing.** A bare `jest.fn()` would return `undefined`, causing `.json(...)` in the code under test to throw a misleading error. The `mockReturnValue(response)` calls on `status`/`json`/`end` exist specifically to prevent this.
- **Header state is case-insensitive.** Express normalizes header names to lowercase before comparison; the stub mirrors that with `name.toLowerCase()` on every key operation. Tests that call `setHeader('X-Request-Id', …)` then `hasHeader('x-request-id')` will pass.
- **Scope boundary.** This stub answers "what did this function try to send." For "what does the API actually return" (routing, middleware order, serialization, global error handler), use the supertest-based helpers in `tests/support/http.ts` instead.
