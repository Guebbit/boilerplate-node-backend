---
source: tests/unit/app/error-handling.test.ts
sha256: ee29e86a1eeac13eda367b6b44eeb7c74c4eb5e6467b0d3464d8a1b84e8d2f2a
generated_at: 2026-10-15T13:03:44.788140+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/app/error-handling.test.ts

## Purpose

Unit-level tests that drive `handleUncaughtError` and `handleUnhandledRejection` directly (no Express routing layer), verifying the status-resolution branching (`clientErrorStatus` / `resolveStatus`), log-content sanitisation, log-level selection, and the unhandled-rejection counter. The file is deliberately scoped to the handler's own decision logic; the Express integration path (synchronous throw → handler) is covered separately in `tests/integration/auth-hardening.test.ts`.

## Key elements

- **`describe('handleUncaughtError')`** — Verifies status resolution: `statusCode` fallback when `.status` is absent, `.status` preferred over `.statusCode`, out-of-range 4xx falls through to 500, non-`Error` values answer 500 without leaking the thrown value into the body, and mid-stream errors (`headersSent: true`) are delegated to `next(err)` without calling `response.status`.
- **`describe('a Mongo/Redis outage …')`** — A nested block testing the `MongoServerSelectionError` branch: answers 503 (not 500), sets `Retry-After` header, and omits the driver message from the JSON body.
- **`describe('handleUncaughtError log content')`** — Spies on `logger.warn` / `logger.error` and asserts that body-parser errors log only `{ type }` (not the quoted password) and Mongo errors log only `{ name, code }` (not the key value). Generic errors are logged whole.
- **`describe('handleUncaughtError log level')`** — 4xx client errors log at `warn`; 5xx server errors log at `error`.
- **`describe('handleUnhandledRejection')`** — Confirms `processUnhandledRejectionsTotal` increments by 1 per call (including non-Error values) and that the handler returns without throwing.
- **Helpers** — `requestStub()` (minimal `Request` with `requestId`), `loggedCall(error)` (spies both log levels, invokes the handler, returns the first log call), `rejectionsCounted()` (reads the Prometheus registry value).

## Relationships

- **`src/app/error-handling.ts`** — Source under test; imports `handleUncaughtError` and `handleUnhandledRejection`.
- **`src/infrastructure/adapters/logger.ts`** — Spied (`warn`, `error`) to assert log level and sanitised content.
- **`src/infrastructure/observability/metrics-process.ts`** — `processUnhandledRejectionsTotal` counter read from the registry to verify rejection counting.
- **`tests/support/express.ts`** — Provides `makeResponseStub()` for the `Response` mock.
- **`tests/support/stub.ts`** — Provides `asStub<Request>()` for the request object.

## Notes

- The module-level `NEXT: NextFunction = jest.fn()` is shared by most `handleUncaughtError` tests; the mid-stream test intentionally creates its own `jest.fn()` to isolate the `next` assertion.
- The file's docblock states it is the *narrower* complement to the integration test: integration proves a synchronous throw reaches the handler; this file proves what the handler does with the two status fields a thrown error may carry.
- Log-content tests use `afterEach(() => jest.restoreAllMocks())` to clean up the `logger` spies; the `loggedCall` helper itself does not restore — it relies on the surrounding `describe`'s `afterEach`.
- The `tests/unit/infrastructure/adapters/mailer-dispatch.test.ts` neighbor appears in the dependency graph but is not imported or referenced by this file.
