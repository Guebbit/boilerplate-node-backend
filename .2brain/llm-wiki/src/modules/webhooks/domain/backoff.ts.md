---
source: src/modules/webhooks/domain/backoff.ts
sha256: 7d970675d221b3ef15727db979843ab2b76588c8d491e41f5e5ec9c9017c17aa
generated_at: 2026-09-23T19:39:32.344296+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/domain/backoff.ts

## Purpose

Pure, dependency-free retry-backoff rules for webhook deliveries. Defines the delay schedule, the max-attempt count, and the auto-disable threshold so that the sweep worker, the attempt service, and unit tests all share a single source of truth for "when is the next try" and "when do we give up on a subscription."

## Key elements

- **`WEBHOOK_RETRY_DELAYS_MS`** — `readonly number[]` of 5 tiers (5 s, 5 min, 30 min, 2 h, 10 h). Indexed 0-based; index _n_ is the wait _after_ attempt _n+1_ fails.
- **`WEBHOOK_MAX_ATTEMPTS`** — `6` (1 initial + 5 retries), derived from the array length.
- **`nextRetryDelayMs(failedAttempt)`** — Returns the delay in ms for the given 1-based failed attempt, or `undefined` when all tiers are spent (signal to mark the delivery `exhausted`).
- **`nextAttemptAt(failedAttempt, now?)`** — Wraps the delay into a `Date` for stamping onto `nextAttemptAt` in the repository. Returns `undefined` when exhausted.
- **`WEBHOOK_MAX_CONSECUTIVE_FAILURES`** — `5`: number of consecutive _exhausted_ chains before a subscription becomes eligible for auto-disable.
- **`WEBHOOK_MIN_FAILING_MS`** — 3 days: time-based floor on how long the streak must persist (matches Stripe's webhook threshold).
- **`shouldAutoDisable(consecutiveFailures, failingSince, now?)`** — Returns `true` only when **both** the chain-count threshold **and** the time floor are met. `failingSince` is `undefined` when no streak is open.

## Relationships

- **`src/modules/webhooks/domain/index.ts`** — Barrel file; re-exports the constants and functions from this module so the rest of the webhooks domain can import them via the package path.
- **`src/modules/webhooks/services/attempt.ts`** — Consumes `WEBHOOK_MAX_ATTEMPTS`, `nextRetryDelayMs`, and `nextAttemptAt` to decide whether to schedule a retry row or mark the delivery exhausted after each failed attempt.
- **`src/modules/webhooks/tests/unit/backoff.test.ts`** — Unit-tests the schedule values, the `undefined` boundary, and the two-gate logic of `shouldAutoDisable` using the injectable `now` parameter.

## Notes

- **1-based indexing.** `failedAttempt` is always 1-based (1 = the initial try). `WEBHOOK_RETRY_DELAYS_MS[0]` is the wait _after_ attempt 1 fails. Off-by-one here is the most common bug.
- **Shape, not precision.** Delays are scheduled onto `nextAttemptAt`; the sweep picks them up at its own interval, so the actual wait can be up to one sweep period later than the nominal value.
- **Auto-disable is a two-gate check.** Count alone or time alone is insufficient. An endpoint that fails fast (short chain) still waits out the 3-day floor; one that fails slowly still needs 5 exhausted chains.
- **`failingSince` lifecycle** is managed by `repository.ts#recordOutcome` (stamped on first failure after a success, cleared on next success) — not by this file.
- **Injectable clock.** Both `nextAttemptAt` and `shouldAutoDisable` accept an optional `now: Date` defaulting to `new Date()`, keeping them pure and testable without `jest.useFakeTimers`.
