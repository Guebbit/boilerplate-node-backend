---
source: tests/unit/app/process-error-handlers.test.ts
sha256: b713d72e33bd87bb59690260a8ef1311f54fa628f9044adc15a70d32e30a17d2
generated_at: 2026-10-15T13:03:56.626807+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/app/process-error-handlers.test.ts

## Purpose

Verifies the process-level `uncaughtException` and `unhandledRejection` handlers installed by `installErrorHandling`. The critical contract under test is environment-dependent: under a test runner the module installs **nothing** (so Jest's own handler still reports the failure against the offending test), while under `development`/`production` it installs exactly one handler that logs via `auditLogger` — and, for exceptions only, calls `process.exit(1)`.

## Key elements

- **`appStub()`** — returns a minimal object (`{ use: jest.fn() }`) cast to the `Parameters<typeof installErrorHandling>[0]` shape, satisfying the Express-app argument without pulling in a real server.
- **`installUnder(nodeEnv)`** — captures the set of listeners *before* calling `installErrorHandling`, invokes it, then diffs to isolate the listeners this call added. Returns `{ addedExceptions, addedRejections, remove }` so each test can assert, invoke, and then cleanly uninstall its handlers (a leaked listener would silence the runner for the rest of the suite).
- **`describe('installErrorHandling — uncaughtException')`** — two assertions: zero handlers installed under `NODE_ENV=test`; exactly one handler under `development`/`production` that calls `auditLogger.error('process.uncaughtException', …)` **before** `process.exit(1)`.
- **`describe('installErrorHandling — unhandledRejection')`** — same zero-vs-one split; the single handler calls `auditLogger.error('process.unhandledRejection', …)` and does **not** exit (the process state after a rejection is defined, unlike an uncaught throw).

## Relationships

- **`src/app/error-handling.ts`** — provides `installErrorHandling`, the function under test. The test calls it and then inspects the process-global listeners it registers.
- **`src/infrastructure/adapters/logger.ts`** — provides `auditLogger`; the tests spy on `auditLogger.error` to assert the exact event name, `origin`, and error payload shape the handlers pass.
- **`tests/support/environment.ts`** — provides `setEnvironment`, used to flip `NODE_ENV` before each `installErrorHandling` call so the environment-branching logic is exercised in isolation.
- **`tests/support/stub.ts`** — provides `asStub`, used by `appStub()` to satisfy the Express-app parameter without a real instance.

## Notes

- Listeners are **process-global**. Every test calls `remove()` in its body (not in `afterEach`) to uninstall exactly the handlers it added; a leaked handler would swallow future `uncaughtException`/`unhandledRejection` events for the remainder of the Jest worker.
- `process.exit` is mocked via `jest.spyOn` — a real call would kill the worker before assertions can run.
- The `addedRejections` array is cast from Node's `(reason, promise) => void` signature to `(reason: unknown) => void` so the test can invoke each handler with a single argument; the app's own handler only reads `reason`.
- The assertion checks the **raw `Error` object** under the `error` key (not a pre-flattened `{name, message}`), because `redactFormat` in `adapters/logger.ts` is responsible for serialization.
