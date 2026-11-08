---
source: src/modules/webhooks/tests/unit/backoff.test.ts
sha256: 06647fc4584ccc2674a4aa5801651f2ac8c2755de4bf133d45ac4c50beafb944
generated_at: 2026-11-08T09:09:53.258318+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/tests/unit/backoff.test.ts

## Purpose

Unit tests for the pure retry-backoff rules defined in the webhooks domain layer. Validates the tiered delay schedule, the exhausted-signal convention, and the dual-threshold auto-disable logic without any external state or timers.

## Key elements

- **`describe('nextRetryDelayMs')`** — Verifies the 1-based tier lookup returns the correct delay per attempt, returns `undefined` once tiers are exhausted, and that the delay array is strictly monotonically increasing.
- **`describe('WEBHOOK_MAX_ATTEMPTS')`** — Asserts the invariant that max attempts equals the number of retry tiers plus one (the initial try).
- **`describe('nextAttemptAt')`** — Confirms the function adds the tier delay to a supplied `Date`, mirrors the `undefined` exhausted signal, and falls back to the real clock (`Date.now()`) when no `now` argument is provided (tested via a before/after window rather than an exact timestamp).
- **`describe('shouldAutoDisable')`** — Exercises the combined gate: auto-disable fires only when **both** the consecutive-failure count meets `WEBHOOK_MAX_CONSECUTIVE_FAILURES` **and** the streak age meets or exceeds `WEBHOOK_MIN_FAILING_MS`. Covers boundary cases (exactly at the floor, one ms short, `undefined` failing-since) and the real-clock default.

## Relationships

- **`src/modules/webhooks/domain/backoff.ts`** — Source of all symbols under test. The test imports every constant and function from this module through the barrel re-export.
- **`src/modules/webhooks/domain/index.ts`** — The barrel (`@modules/webhooks/domain`) through which the test resolves its imports; no logic of its own is exercised here.

## Notes

- Attempt numbers are **1-based** throughout; the exhausted check uses `WEBHOOK_MAX_ATTEMPTS` (i.e. `delays.length + 1`) rather than `delays.length`.
- The "defaults to the real clock" assertions use a `[before, after]` window because `Date.now()` inside the function necessarily runs a moment after the test captures `before`. Avoid changing those to strict equality.
- `shouldAutoDisable` is inclusive at both boundaries: exactly `WEBHOOK_MIN_FAILING_MS` elapsed and exactly `WEBHOOK_MAX_CONSECUTIVE_FAILURES` count both satisfy the condition.
