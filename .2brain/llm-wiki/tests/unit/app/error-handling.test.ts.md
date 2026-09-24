---
source: tests/unit/app/error-handling.test.ts
sha256: 01e9699f78aa84ef6bf5813fccabea1cfff3b700a768722355b08c4e7bdf7e0f
generated_at: 2026-09-23T20:15:11.363818+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/app/error-handling.test.ts

## Purpose

Unit tests for the status-resolution branch of `handleUncaughtError`. The file drives the handler directly (no express app, no throwing route) to isolate `clientErrorStatus`'s decision logic: how it picks between `error.status` and `error.statusCode`, and when it rejects both in favor of the 500 fallback. The express-level integration (a synchronous throw actually reaching this handler) is covered separately in `tests/integration/auth-hardening.test.ts`.

## Key elements

- **`requestStub()`** — builds a minimal `Request` stub (only `requestId`, `path`, `method`) via `asStub`; the sole field the handler reads for its log line.
- **`NEXT`** — module-level `jest.fn()` standing in for `NextFunction`; not asserted on.
- **`handleUncaughtError` describe block** — three cases:
    - `statusCode`-only error (Node convention, no `.status`) → handler calls `res.status(416)`.
    - Both `status` and `statusCode` present → handler prefers `status` (409 wins over 416).
    - `statusCode: 599` (out of 4xx range) → handler falls through to 500.

## Relationships

- **`src/app/error-handling.ts`** — module under test; exports `handleUncaughtError`.
- **`tests/support/express.ts`** — provides `makeResponseStub()`, the mocked `Response` object whose `status` call is the assertion target.
- **`tests/support/stub.ts`** — provides `asStub()`, used to cast a plain object into the `Request` type without a full express request.

## Notes

- The file is intentionally narrower than the integration test: it does **not** verify that express actually routes a thrown error into `handleUncaughtError`, nor that body-parser rejections carry the right `.status`/`.expose`. Only the `clientErrorStatus` branching is exercised here.
- The 599 case is the guard against `clientErrorStatus` accepting any numeric `statusCode`; it must stay in 4xx or the handler must fall back to 500.
- `asStub` is a type-level cast only (no runtime proxy), so tests rely on the handler reading exactly the fields present in the stub object.
