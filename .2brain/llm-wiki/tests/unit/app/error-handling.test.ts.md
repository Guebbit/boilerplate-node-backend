---
source: tests/unit/app/error-handling.test.ts
sha256: a21489aa2b63873645fb84e2395409ec9f6b8511bba3613f508d9e3d664b996c
generated_at: 2026-11-08T10:02:40.772679+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/app/error-handling.test.ts

## Purpose

Unit-tests `handleUncaughtError` and `handleUnhandledRejection` by calling them directly with hand-built error objects, bypassing the Express middleware layer. Covers status-code resolution, response-body error-code mapping, log sanitization (no secrets in logs), log-level selection, and the unhandled-rejection counter.

## Key elements

- **`requestStub()`** — returns a minimal `Request` stub (`requestId`, `path`, `method`) via `asStub`.
- **`describe('handleUncaughtError')`** — asserts status resolution precedence (`status` over `statusCode`), 4xx/5xx fallback, CastError code parity with `rejectDatabaseError`, and the Mongo/Redis outage 503 + `Retry-After` branch.
- **`describe('handleUncaughtError log content')`** — verifies that body-parser errors log only `{ type }`, Mongo errors log only `{ name, code }`, and generic errors log the full object; in each case the original message is absent.
- **`describe('handleUncaughtError log level')`** — 4xx → `logger.warn`, 5xx → `logger.error`; never both.
- **`loggedCall(error)`** (helper) — spies on `logger.warn` and `logger.error`, invokes the handler, returns the single captured call.
- **`describe('handleUnhandledRejection')`** — confirms the Prometheus counter increments per call and the function never throws (process stays alive).
- **`rejectionsCounted()`** (helper) — reads `processUnhandledRejectionsTotal` from the metrics registry to get the current counter value.

## Relationships

- **`src/app/error-handling.ts`** — imports `handleUncaughtError` and `handleUnhandledRejection`; the primary SUT.
- **`src/infrastructure/adapters/logger.ts`** — imports `logger` and spies on `.warn` / `.error` to assert level and content.
- **`src/infrastructure/http/errors.ts`** — imports `rejectDatabaseError` to compare the escaped-CastError code against the controller-caught code.
- **`src/infrastructure/observability/metrics-process.ts`** — imports `processUnhandledRejectionsTotal` to read the counter value in assertions.
- **`tests/support/stub.ts`** — uses `asStub` to create the `Request` mock.
- **`tests/support/express.ts`** — uses `makeResponseStub` for all `Response` mocks (including adding `setHeader` for the 503 branch and `headersSent` for the mid-stream test).

## Notes

- The file intentionally does **not** exercise Express middleware; integration tests (`tests/integration/auth-hardening.test.ts`) cover the "synchronous throw reaches this handler" property.
- The Mongo/Redis outage tests need `setHeader` added to the response stub because that branch sets `Retry-After` in addition to `status`/`json`.
- `loggedCall` always returns exactly one log entry (first of `warn` or `error` calls); the handler is contractually single-call.
- The non-Error thrower test (`'boom'` string) asserts the handler itself does not throw and that the raw value never appears in the JSON body.
