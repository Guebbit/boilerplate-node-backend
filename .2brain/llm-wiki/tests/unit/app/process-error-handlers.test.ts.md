---
source: tests/unit/app/process-error-handlers.test.ts
sha256: b713d72e33bd87bb59690260a8ef1311f54fa628f9044adc15a70d32e30a17d2
generated_at: 2026-11-08T10:02:51.723448+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/app/process-error-handlers.test.ts

## Purpose

Verifies that `installErrorHandling` registers process-level `uncaughtException` and `unhandledRejection` listeners correctly per environment: no listener under a test runner (so Jest's own handler reports the failure), and exactly one listener in `development`/`production` that logs via `auditLogger` and, for exceptions only, calls `process.exit(1)`. The file exists because a listener *replaces* Node's default behaviour rather than adding to it—a branch that skipped logging would make fatal defects pass silently in both CI and local dev.

## Key elements

- **`appStub()`** — returns a minimal object shaped like an Express app (just `use: jest.fn()`) so `installErrorHandling` can be called without a real server.
- **`installUnder(nodeEnv: string)`** — sets `NODE_ENV` via `setEnvironment`, calls `installErrorHandling(appStub())`, diffs `process.listeners` before/after to capture only the newly added listeners, and returns them alongside a `remove()` cleanup that calls `process.off` for each.
- **`describe('installErrorHandling — uncaughtException')`** — asserts zero handlers installed under `test`; under `development`/`production` asserts one handler that calls `auditLogger.error('process.uncaughtException', …)` *before* `process.exit(1)`.
- **`describe('installErrorHandling — unhandledRejection')`** — asserts zero handlers under `test`; under `development`/`production` asserts one handler that calls `auditLogger.error('process.unhandledRejection', …)` and does **not** exit (process state remains defined after a rejection).

## Relationships

- **`src/app/error-handling.ts`** — module under test; this file imports and invokes `installErrorHandling`.
- **`src/infrastructure/adapters/logger.ts`** — provides `auditLogger`; tests spy on its `error` method to assert call arguments and ordering relative to `process.exit`.
- **`tests/support/environment.ts`** — provides `setEnvironment` to switch `NODE_ENV` between test cases.
- **`tests/support/stub.ts`** — provides `asStub` used by `appStub()` to build the fake Express app parameter.

## Notes

- **Listeners are process-global.** Every test that installs a listener must call the returned `remove()` in its teardown; a leaked handler silences Jest's own reporting for the remainder of the suite run.
- **`process.exit` is mocked.** The real `exit` would terminate the Jest worker, so the test spies on it with a no-op and asserts the code (`1`) is passed.
- **Arity cast on rejections.** Node types `unhandledRejection` listeners as `(reason, promise) => void`, but this app's handler only reads `reason`. The test file narrows the type via a cast so it can call the handler with a single argument.
- **Order assertion is intentional.** The `uncaughtException` test checks that `auditLogger.error` was called *before* `process.exit`—the audit write must not be lost if the process dies.
