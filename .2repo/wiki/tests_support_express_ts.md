# tests/support/express.ts

## Purpose

Provides a chainable Express `Response` stub for unit tests that assert on what a middleware, error responder, or controller rejection path sends. It is intentionally *not* a replacement for integration testing via `tests/support/http.ts` — it answers "what did this function try to send", not "what does the API actually return".

## Key elements

- **`ResponseStub`** (type export) — `Response & { status: jest.Mock; json: jest.Mock }`. Keeps the `jest.Mock` signature visible so tests can assert on call order and count, not just the final payload.
- **`makeResponseStub()`** (function export) — Builds a stub where `status()` and `json()` record their arguments and return the response object itself, making the fluent `status(...).json(...)` chain work without throwing.

## Relationships

- **`tests/support/stub.ts`** — Imports `asStub` to create the base proxy/wrapper object on which the jest mocks are attached.
- **`tests/unit/infrastructure/http/errors.test.ts`**, **`.../security.test.ts`**, **`.../response.test.ts`**, **`tests/unit/kernel/authorizations.test.ts`** — Each imports `makeResponseStub` (and the `ResponseStub` type) to construct the response fixture for assertions on `status`/`json` calls.

## Notes

- Both `status` and `json` are wired with `mockReturnValue(response)` — a bare `jest.fn()` would return `undefined` and break the chain before `json()` could record its argument.
- The `jest.Mock` type is kept on the exported type deliberately; do not narrow it to a plain function signature if you refactor, or tests lose the ability to assert on call order/count.
- Use only for single-function response assertions. Full endpoint behavior (routing, middleware chain, auth, serialization, global error handler) must go through the supertest-based helpers in `tests/support/http.ts`.
