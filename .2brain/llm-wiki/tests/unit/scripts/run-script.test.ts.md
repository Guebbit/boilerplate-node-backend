---
source: tests/unit/scripts/run-script.test.ts
sha256: 54bf074be30882a94a96cc6d624b0b2e407dca9f779aa5d1ca6f213268ad619e
generated_at: 2026-11-08T10:40:11.659046+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/run-script.test.ts

## Purpose

Unit tests for the `runScript` entry-point wrapper. Verifies the four behaviours a bare promise chain lacks: non-zero `process.exitCode` on failure, guaranteed cleanup even when the body throws, a logged reason for the failure, and a job-outcome record visible to the health endpoint. Also covers edge cases: non-Error rejections, failing cleanup, and the config-gate (refusal) path.

## Key elements

- **`runScript`** (imported from `scripts/run-script.ts`) — the sole function under test; receives an optional job name, a body function, and a cleanup function.
- **`jest.mock` factories** — inline `jest.fn()` stubs for `logger`, `recordJobOutcome`, and `assertProcessConfig`. Written inline (not via outer consts) to survive Jest's mock hoisting.
- **`ORIGINAL_EXIT_CODE`** — captures `process.exitCode` before tests; restored in `afterEach` to prevent cross-test contamination.
- **`refuse()`** — helper that re-implements `assertProcessConfig` to throw a typed config-validation error, simulating the gate's "invalid environment" verdict.
- **`describe('runScript on an invalid environment', …)`** — asserts body is never called, exit code is 1, error is logged, cleanup still runs, and no job outcome is recorded.
- **`describe('runScript', …)`** — happy-path ordering, body-throw handling, cleanup-always-runs, never-rejects contract, cleanup-failure-as-warning, both-fail scenario, and non-Error (`'a bare string'`) rejection.
- **`describe('runScript — job-health recording', …)`** — verifies `recordJobOutcome` is called with `{ failed: false }`, `{ failed: true, error }`, or not called at all (no job name).
- **`describe('runScript on an invalid environment with a failing cleanup', …)`** — confirms cleanup failure on the refusal path is logged via `logger.warn`, not swallowed.

## Relationships

- **`scripts/run-script.ts`** — the module under test; `runScript` is imported and exercised in every test case.
- **`src/infrastructure/adapters/logger.ts`** — fully mocked; tests assert on `logger.error` (body failures, config refusals) and `logger.warn` (cleanup failures).
- **`src/infrastructure/persistence/lease.ts`** — `recordJobOutcome` is mocked; tests verify it receives the job name and a `{ failed, error? }` shape only when a name was provided and the body actually ran.
- **`src/app/config.ts`** — `assertProcessConfig` is stubbed as a no-op (or made to throw via `refuse()`). The gate's internal logic is out of scope here; only `runScript`'s reaction to the thrown verdict is tested.

## Notes

- Cleanup on the failure path is explicitly called out as **load-bearing**: without it, `scenario:apply` leaks Mongo/Redis sockets on a throw and the process hangs.
- `runScript` must **never reject** — callers rely on this and do not attach their own `.catch`.
- When both body and cleanup fail, the body's error goes to `logger.error` and cleanup's to `logger.warn`; the exit code remains 1.
- A cleanup failure on the **success** path does **not** flip the exit code to 1; it only produces a warning.
- The non-Error rejection test carries an `eslint-disable` for `@typescript-eslint/prefer-promise-reject-errors` because a bare string is the scenario being verified.
