---
source: tests/unit/scripts/run-script.test.ts
sha256: 9c1cd4df69225a2bdf55ee08b1a7cf63c3dc5328c8efc22f7919afb5d75890ca
generated_at: 2026-10-15T13:29:43.680092+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/run-script.test.ts

## Purpose

Unit tests for `runScript`, the script entry-point wrapper. Verifies its four contract behaviours that a bare promise chain lacks: setting a non-zero exit code on failure, running caller-supplied cleanup even when the body throws, logging the failure reason, and (D9) recording a job outcome visible to the health endpoint. Also covers the config-gate path where the script must refuse to start.

## Key elements

- **`jest.mock` for `@infrastructure/adapters/logger`, `@infrastructure/persistence/lease`, `@app/config`** — inline `jest.fn()` factories (not outer `const`s) because `jest.mock` is hoisted above imports and a factory closing over a `const` would hit the temporal dead zone.
- **`refuse()` helper** — sets `assertProcessConfig` to throw a simulated "invalid environment" error, modelling the config gate rejecting a bad `NODE_PORT`.
- **`describe('runScript on an invalid environment')`** — body never runs, exit code is 1, `logger.error` called with the reason, cleanup still invoked, no `recordJobOutcome` call, a failing cleanup does not reject the outer promise.
- **`describe('runScript')`** — happy path ordering (main → cleanup), exit code left untouched, body-throw sets exit 1 + logs error, cleanup still runs on throw, outer promise never rejects, cleanup-failure on a successful run logs a `warn` without flipping exit code, dual failure preserves exit 1 with body error and cleanup warning, non-Error rejection handled without `.message` crash.
- **`describe('runScript — D9 job-health recording')`** — `recordJobOutcome` called with `(name, { failed: false })` on success, `(name, { failed: true, error })` on throw, not called when name is `undefined`.
- **`describe('runScript on an invalid environment with a failing cleanup')`** — cleanup failure during a refused boot still logs via `logger.warn`.
- **`afterEach`** — restores `process.exitCode` to its original value and clears `recordJobOutcome` / `assertProcessConfig` mocks.

## Relationships

- **`scripts/run-script.ts`** — the module under test; `runScript(name, main, cleanup)` is the sole function exercised.
- **`src/app/config.ts`** — `assertProcessConfig` is mocked as the "gate." The test only verifies what `runScript` does with a thrown verdict; the gate's own logic is tested in `tests/unit/app/config.test.ts` and `tests/unit/kernel/`.
- **`src/infrastructure/adapters/logger.ts`** — `logger.error` and `logger.warn` are spied on to assert the logged failure reason and the cleanup-failure warning.
- **`src/infrastructure/persistence/lease.ts`** — `recordJobOutcome` is spied on to confirm D9 job-health recording (called with job name + outcome object, or omitted for unnamed one-off scripts).

## Notes

- `process.exitCode` is a global side-effect; the `afterEach` block saves and restores it so tests are order-independent.
- The non-Error rejection test (`'a bare string'`) carries an `eslint-disable` for `@typescript-eslint/prefer-promise-reject-errors` because rejecting with a non-Error is precisely the case under test.
- Mock factories use inline `jest.fn()` calls rather than referencing outer `const` variables — a deliberate workaround for `jest.mock` hoisting.
- `recordJobOutcome` is not expected to be called when the config gate refuses, because the job never started and recording would require a live database connection.
