---
source: tests/unit/scripts/run-script.test.ts
sha256: 4ab1b3c0374bfa0ab299aef358a2c052498caa768202e78a374ea19fa6a48406
generated_at: 2026-09-27T16:14:15.409732+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/run-script.test.ts

## Purpose

Unit tests for the `runScript` wrapper, verifying its four guarantees beyond a bare promise chain: a non-zero exit code on failure, cleanup execution on *both* success and failure paths, a logged reason for any failure, and a D9 job-outcome record visible to the health endpoint. The cleanup-on-throw case is explicitly called out as load-bearing — without it, `scenario:apply` leaves Mongo/Redis sockets open and the process hangs.

## Key elements

- **`describe('runScript')`** — seven tests covering: happy path (order + no side-effects), body throws (exit code 1 + `logger.error`), cleanup still runs when body throws, `runScript` never rejects (resolves `undefined`), cleanup failure does not demote a successful run (logged via `logger.warn`), both body and cleanup fail (error + warn both asserted), non-Error rejection (bare string; ensures no `.message` crash).
- **`describe('runScript — D9 job-health recording')`** — three tests: success recorded with `{ failed: false }`, failure recorded with `{ failed: true, error }`, and no recording when `name` is `undefined` (one-off script, not a crontab job).
- **Mocks** — `logger` (info/warn/error/debug) and `recordJobOutcome` are fully mocked inline inside `jest.mock` factories to avoid hoisting issues with outer `const` bindings.
- **`afterEach`** — restores `process.exitCode` to its pre-test value and clears `recordJobOutcome` call history.

## Relationships

- **`scripts/run-script.ts`** — the module under test; `runScript(name, body, cleanup)` is the sole import exercised.
- **`src/infrastructure/adapters/logger.ts`** — mocked; tests assert `logger.error` and `logger.warn` are called with the expected error payload.
- **`src/infrastructure/persistence/lease.ts`** — mocked via `recordJobOutcome`; tests assert it receives `(name, { failed, error? })` or is not called at all.

## Notes

- `jest.mock` factories must use inline `jest.fn()` calls rather than closing over outer `const`s, because Babel hoists `jest.mock` above the import statements.
- `process.exitCode` is mutated by `runScript`; the test saves the original value before the suite and restores it in `afterEach` to avoid cross-test contamination.
- The non-Error rejection test carries an `eslint-disable` for `@typescript-eslint/prefer-promise-reject-errors` because the bare-string rejection *is* the case under test.
- Cleanup failure is intentionally non-fatal: it is reported as a `warn`, not an `error`, and does not change the exit code of an otherwise-successful run.
