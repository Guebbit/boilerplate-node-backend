---
source: tests/support/express.ts
sha256: 8e9336c0427fa1835352a20280687e52650b64d5ae44f9a1c59f10bf6244f689
generated_at: 2026-10-29T07:07:51.749745+00:00
model: ollama:qwen3.8:27b
---

# tests/support/express.ts

## Purpose

Provides a chainable Express `Response` stub for unit tests that assert on what a middleware, error handler, or controller *attempts to send* (status code, JSON body, headers). It is intentionally scoped to single-function tests and is **not** a substitute for `tests/support/http.ts`, which drives the full app over supertest for endpoint-level assertions.

## Key elements

- **`ResponseStub` (type)** — `express.Response` extended with `status`, `json`, `setHeader`, `hasHeader`, `getHeader`, `removeHeader` as `jest.Mock`. Tests read mock call history for order/count assertions.
- **`makeResponseStub()` (function)** — Returns a `ResponseStub` where:
  - `status()` and `json()` record arguments and return the stub itself, enabling the fluent chain `res.status(404).json(body)`.
  - Header methods (`setHeader`, `getHeader`, `hasHeader`, `removeHeader`) maintain an internal `Map<string, unknown>` keyed by lower-cased name, so code that checks `hasHeader` before setting a default gets a truthful answer.
  - Backed by `asStub` from `tests/support/stub.ts`.

## Relationships

- **Imports** `asStub` from `tests/support/stub.ts` to construct the stub object.
- **Imported by** the following test files (all use it to assert on response-writing behavior of a single function):
  - `tests/unit/infrastructure/http/errors.test.ts`
  - `tests/unit/infrastructure/http/response.test.ts`
  - `tests/unit/infrastructure/http/middlewares/human-challenge.test.ts`
  - `tests/unit/infrastructure/http/middlewares/idempotency.test.ts`
  - `tests/unit/infrastructure/http/middlewares/upload.test.ts`
  - `tests/unit/infrastructure/surfaces/create-update-controller.test.ts`
  - `tests/unit/app/error-handling.test.ts`
  - `tests/unit/kernel/authorizations.test.ts`
  - `tests/unit/kernel/step-up.test.ts`
  - `src/modules/observability/tests/unit/metrics-scraper.test.ts`

## Notes

- The fluent-chain mock (`status`/`json` returning the stub) is required; a bare `jest.fn()` would return `undefined` and break `.json(...)` in production-style chained calls, producing confusing failures.
- Header tracking is not a full Express header implementation—only the five methods listed. Code that reads `res.headers` directly will not see the tracked values.
- If a test needs to verify the *actual* HTTP response (routing, middleware chain, global error handler, serialization), use `tests/support/http.ts` instead; this stub answers only "what did this one function try to send."
