---
source: tests/unit/app/error-handling.test.ts
sha256: 117ba3b1fc43c2b8a65fa84e21150eb17e1e801265a141e735366f8c01f7de8c
generated_at: 2026-09-27T16:01:53.619558+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/app/error-handling.test.ts

## Purpose

Unit-tests `handleUncaughtError` by calling it directly (bypassing the Express layer) to isolate the `resolveStatus` / `clientErrorStatus` branching: which status code is sent based on the error's `status`/`statusCode` fields, how mid-stream errors are delegated to `next()`, and how a Mongo/Redis outage yields a 503 with `Retry-After` instead of a generic 500.

## Key elements

- **`requestStub()`** – returns a minimal `Request` stub (via `asStub`) carrying only `requestId`, `path`, and `method` — the single field the handler reads for its log line.
- **`NEXT`** – module-level `jest.fn()` serving as the `NextFunction` argument in most cases.
- **`describe('handleUncaughtError', …)`** – the sole suite. Contains six `it` blocks:
  - *statusCode fallback*: error with only `statusCode: 416` → responds 416.
  - *status preferred over statusCode*: both present → responds with `status` (409).
  - *Non-4xx `statusCode` (599)*: falls through to the database interpreter → responds 500.
  - *Mid-stream error* (`headersSent: true`): handler calls `next(error)` and does **not** call `response.status`.
  - *`describe('a Mongo/Redis outage …')`* – three assertions for a `MongoServerSelectionError`: responds 503, sets `Retry-After` header, and does not leak the driver message into the JSON body.
- **`responseWithHeaders()`** (local helper) – extends `makeResponseStub()` with a `setHeader` mock, needed only for the 503 branch.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/app/error-handling.ts` | Exports `handleUncaughtError`, the sole function under test. |
| `tests/support/express.ts` | Provides `makeResponseStub()`, which supplies the mockable `status` / `json` (and optionally `setHeader`) methods. |
| `tests/support/stub.ts` | Provides `asStub<T>()`, used to create the minimal `Request` object without a full Express middleware chain. |

## Notes

- The file's top docblock explicitly scopes it as the *narrower* companion to `tests/integration/auth-hardening.test.ts`, which already verifies that a synchronous throw in a route actually reaches this handler through Express.
- Errors are constructed with `Object.assign(new Error(…), { … })` rather than `http-errors`, to exercise the raw `status` / `statusCode` field logic independently of `http-errors`'s conventions.
- The 503-outage tests assert that `JSON.stringify(response.json.mock.calls[0][0])` does **not** contain the driver's message — a deliberate non-leak guarantee.
