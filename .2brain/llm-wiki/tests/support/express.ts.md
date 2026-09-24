---
source: tests/support/express.ts
sha256: d4ae1c2bea3b7d5b8b6b01318b68cfe86e18b3aff72af677b54326a92c09fbea
generated_at: 2026-09-23T20:10:48.004957+00:00
model: ollama:qwen3.8:27b
---

# tests/support/express.ts

## Purpose

Provides a chainable Express `Response` stub for unit tests that verify what a middleware, controller, or error responder *attempts* to write (status code, JSON body) without spinning up a server. It exists so tests can assert on call arguments, order, and count rather than needing a real HTTP round-trip.

## Key elements

- **`ResponseStub`** (type) — `Express.Response` extended with `status: jest.Mock` and `json: jest.Mock`, so tests can inspect call history.
- **`makeResponseStub()`** (function) — Builds a `ResponseStub` via `asStub`; wires `status` and `json` to return the response object itself so the fluent chain `response.status(404).json(body)` works without throwing.

## Relationships

- **Depends on** `tests/support/stub.ts` — calls `asStub` to shallow-clone a `Response` with mock methods.
- **Consumed by** the unit test files that exercise response-writing code paths: `tests/unit/app/error-handling.test.ts`, `tests/unit/infrastructure/http/errors.test.ts`, `tests/unit/infrastructure/http/middlewares/{human-challenge,idempotency,upload}.test.ts`, `tests/unit/infrastructure/http/response.test.ts`, `tests/unit/kernel/authorizations.test.ts`, and `src/modules/observability/tests/unit/metrics-scraper.test.ts`. Each of these imports `makeResponseStub` to stand in for the real `res` object in isolated function-level tests.

## Notes

- Intentionally limited to `status` and `json`. If a test needs `send`, `redirect`, or `set`, they are not covered here — add them to the stub or switch to `tests/support/http.ts` for full integration coverage.
- The doc block explicitly warns: do **not** use this stub to verify "what the API returns." Routing, middleware ordering, auth, and the global error handler are all skipped; use `tests/support/http.ts` (supertest) for that.
- Both mock methods return the stub itself (not `undefined`) to preserve Express's fluent-chain semantics. A bare `jest.fn()` would break `status(...).json(...)`.
