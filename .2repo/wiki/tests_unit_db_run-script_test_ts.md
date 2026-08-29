# tests/unit/db/run-script.test.ts

## Purpose

Unit tests for the `runScript` wrapper in `db/run-script.ts`, which adds three guarantees to a bare promise chain: a non-zero exit code on failure, guaranteed cleanup execution (critical for closing Mongo/Redis sockets on `db:seed`), and a logged error reason. This file verifies all of those behaviours plus edge cases like non-Error rejections and simultaneous body+cleanup failures.

## Key elements

- **`describe('runScript')`** — the single test suite covering 7 cases:
  - Happy path: body runs, then cleanup, exit code untouched.
  - Body throws: exit code set to 1, `logger.error` called with the message.
  - Body throws, cleanup still executes (the "hang" regression: a throw skips a trailing `.then(cleanup)`).
  - `runScript` never rejects to the caller (always resolves to `undefined`).
  - Cleanup fails but body succeeded → exit code stays normal, `logger.warn` called.
  - Both body and cleanup fail → exit code 1, both `logger.error` and `logger.warn` called.
  - Non-Error rejection (bare string) → no crash on `.message`, `stack` is `undefined`.
- **`jest.mock('@infrastructure/adapters/logger', …)`** — inline factory so `jest.fn()`s are created at mock-definition time, avoiding the TDZ issue that would occur with outer `const` variables (hoisting above imports).
- **`afterEach` block** — restores `process.exitCode` to its original value after each test.

## Relationships

- **`db/run-script.ts`** — the module under test. Imports and exercises its single export `runScript(body, cleanup)`.
- **`src/infrastructure/adapters/logger.ts`** — mocked in its entirety. The tests assert on `logger.error` (failure verdicts) and `logger.warn` (cleanup-failure-only) calls, verifying the structured object shape (`{ error, stack }`).

## Notes

- `process.exitCode` is global mutable state; every test that mutates it relies on the `afterEach` reset. Adding a new test that sets it without restoring will leak into subsequent tests.
- The non-Error throw test has an `eslint-disable` for `prefer-promise-reject-errors` — this is intentional, not a suppression to remove.
- The inline `jest.fn()` pattern inside the `jest.mock` factory is deliberate (see comment in source). Refactoring to outer `const` mocks will break at runtime due to hoisting.
