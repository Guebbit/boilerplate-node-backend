---
source: tests/unit/app/process-error-handlers.test.ts
sha256: def5c915208f6ba1d301bd486de4d6eda0ce0acbc15b531b090eb12c39836994
generated_at: 2026-09-23T20:15:20.624697+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/app/process-error-handlers.test.ts

## Purpose

Unit-tests the process-level `uncaughtException` and `unhandledRejection` handlers installed by `installErrorHandling`. It verifies the critical two-way contract: under a test runner no handler is installed (so Jest's own reporting remains intact), and under `development`/`production` a handler is installed that audits the event via the logger (and, for `uncaughtException` only, calls `process.exit(1)`).

## Key elements

- **`appStub()`** — returns a minimal object with a `jest.fn()` `use` method, just enough to satisfy `installErrorHandling`'s parameter type.
- **`installUnder(nodeEnv)`** — captures existing process listeners, sets `NODE_ENV`, calls `installErrorHandling`, then returns only the *newly added* listeners for each event plus a `remove()` cleanup. This isolates the test from any pre-existing handlers.
- **`describe('…uncaughtException')`** — asserts zero handlers under `NODE_ENV=test`; asserts one handler under `development`/`production` that calls `auditLogger.error` with the raw `Error` and then `process.exit(1)`.
- **`describe('…unhandledRejection')`** — asserts zero handlers under `test`; asserts one handler under `development`/`production` that calls `auditLogger.error` with the raw rejection reason and does **not** exit.

## Relationships

- **`src/app/error-handling.ts`** — provides `installErrorHandling`, the function under test.
- **`src/infrastructure/adapters/logger.ts`** — provides `auditLogger`; the test spies on `auditLogger.error` to assert the call shape and ordering.
- **`tests/support/stub.ts`** — provides `asStub`, used to build the minimal Express-app stub.

## Notes

- The test installs **real** process listeners (not mocks) and must remove them via the returned `remove()` in every case; a leaked handler would silence Jest's own reporting for the remainder of the suite.
- `process.exit` is spied and no-op'd because an actual call would kill the Jest worker mid-test.
- `addedRejections` is cast to a single-arity `(reason: unknown) => void` because the app handler only reads `reason`, while Node's type signature is `(reason, promise) => void`.
- The test asserts the raw `Error` object is passed under the `error` key (not a pre-flattened `{name, message}`), pinning the serialization contract to `redactFormat` in the logger adapter.
