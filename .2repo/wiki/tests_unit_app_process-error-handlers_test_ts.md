# tests/unit/app/process-error-handlers.test.ts

## Purpose

Verifies that `installErrorHandling` installs the correct process-level listeners for `uncaughtException` and `unhandledRejection` depending on `NODE_ENV`. It exists because a silent failure to log-and-exit on a fatal throw is invisible: the process keeps running in an unknown state, tests pass green, and the server simply "stops doing that thing" in production.

## Key elements

- **`appStub()`** – Returns a minimal object satisfying the `Parameters<typeof installErrorHandling>[0]` type (an Express app with a mocked `use`).
- **`installUnder(nodeEnv)`** – Core helper. Snapshots existing listeners, calls `installErrorHandling` with the stub, diffs the listener arrays to isolate what *this* call added, and returns `{ added, rejectionsAdded, remove }`. `remove` is mandatory: leaked process-global listeners silently swallow subsequent errors for the rest of the suite.
- **`describe('uncaughtException')`** – Two cases: (1) under `NODE_ENV=test` no handler is installed (Jest's own handler reports the throw); (2) under `development`/`production` exactly one handler is installed, and when invoked it calls `auditLogger.error('process.uncaughtException', …)` **before** calling `process.exit(1)`.
- **`describe('unhandledRejection')`** – One case: the rejection handler is installed even under `test`, and when invoked it calls `auditLogger.error('process.unhandledRejection', …)` without exiting (a rejected promise leaves the process in a defined state).

## Relationships

- **`src/app/error-handling.ts`** – The module under test; exports `installErrorHandling`.
- **`src/infrastructure/adapters/logger.ts`** – Exports `auditLogger`, spied on to assert the exact log call shape and ordering.
- **`tests/support/stub.ts`** – Exports `asStub`, used to build the Express-app stub.

## Notes

- `process.exit` is replaced with a `jest.spyOn` stub; the real `process.exit` would terminate the Jest worker, killing the test mid-assertion.
- The tests assert call **ordering** (audit → exit) as a semantic guarantee, not just that both calls happened.
- `uncaughtException` and `unhandledRejection` have deliberately asymmetric test-runner behaviour: the former is *not* installed under `test`, the latter *is*. This asymmetry is the point of the suite.
- Cleanup (`remove()`) is called in every `it` block, not in `afterEach`; a missing call leaks a process-global listener for the remainder of the run.
