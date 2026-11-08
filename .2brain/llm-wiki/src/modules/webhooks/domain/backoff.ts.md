---
source: src/modules/webhooks/domain/backoff.ts
sha256: 978a4bf3ac51799a27d1f876b1df3fcfc30280ecd21264204ce4c361f40d115d
generated_at: 2026-11-08T09:02:26.074718+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/domain/backoff.ts

## Purpose

Defines the retry backoff schedule and the auto-disable threshold as pure, side-effect-free rules so the sweep job, the delivery worker, and unit tests all share one canonical table of delays and limits. All numeric values are pulled from a generated artifact (`rules.generated`) that is derived from `rules.yaml`; this file adds no hardcoded constants.

## Key elements

- **`WEBHOOK_RETRY_DELAYS_MS`** – `readonly number[]` of per-tier delays (5 s → 5 m → 30 m → 2 h → 10 h), re-exported from `retryRules.delaysMs`.
- **`WEBHOOK_MAX_ATTEMPTS`** – Total delivery attempts allowed (initial try + one per delay tier). Derived as `WEBHOOK_RETRY_DELAYS_MS.length + 1`.
- **`nextRetryDelayMs(failedAttempt)`** – Returns the ms delay after the given (1-based) failed attempt, or `undefined` once all tiers are spent.
- **`nextAttemptAt(failedAttempt, now?)`** – Returns the wall-clock `Date` to stamp on `nextAttemptAt`, or `undefined` when exhausted. `now` is injectable for tests.
- **`WEBHOOK_MAX_CONSECUTIVE_FAILURES`** – Number of consecutive *exhausted* retry chains before auto-disable is considered (sourced from `autoDisableRules`).
- **`WEBHOOK_MIN_FAILING_MS`** – Minimum duration (3 days) a failure streak must persist before auto-disable; guards against platform-wide outages exhausting every chain simultaneously.
- **`shouldAutoDisable(consecutiveFailures, failingSince, now?)`** – Composite gate: returns `true` only when **both** the chain count ≥ `WEBHOOK_MAX_CONSECUTIVE_FAILURES` **and** the streak age ≥ `WEBHOOK_MIN_FAILING_MS`. `failingSince` of `undefined` short-circuits to `false`.

## Relationships

- **`src/modules/webhooks/domain/index.ts`** – Domain barrel; re-exports the symbols in this file so callers import from the domain package root rather than reaching into `backoff.ts` directly.
- **`src/modules/webhooks/services/attempt.ts`** – The delivery-attempt service is the primary consumer: it calls `nextAttemptAt` to schedule the next retry row and `shouldAutoDisable` to decide whether to flip a subscription to disabled.
- **`src/modules/webhooks/tests/unit/backoff.test.ts`** – Unit tests exercise `nextRetryDelayMs`, `nextAttemptAt`, and `shouldAutoDisable` with injected `now` values to verify tier boundaries and the dual-condition auto-disable gate.

## Notes

- **1-based indexing.** `failedAttempt` is the attempt that *just failed*; `WEBHOOK_RETRY_DELAYS_MS[0]` is the wait *after* attempt 1. Off-by-one here is a common mistake.
- **`undefined`, not a sentinel number, signals exhaustion.** Callers must check for `undefined` before treating the result as a delay.
- **Two-condition auto-disable.** Neither the chain count nor the time floor alone is sufficient; both must be met. This prevents a fast-failing endpoint (high count, low duration) or a slow-failing one (low count, high duration) from disabling on its own.
- **Granularity is the sweep interval.** Delays shape the backoff curve but do not guarantee exact fire times—the sweep polls at its own cadence.
- **All tunable numbers live in `rules.yaml` → `rules.generated`.** Changing a delay or threshold means editing the YAML source, not this file.
