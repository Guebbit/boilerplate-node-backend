---
source: src/modules/webhooks/domain/backoff.ts
sha256: 978a4bf3ac51799a27d1f876b1df3fcfc30280ecd21264204ce4c361f40d115d
generated_at: 2026-10-29T06:26:43.254407+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/domain/backoff.ts

## Purpose

Pure domain rules defining the webhook retry backoff schedule (delay tiers, max attempts) and the auto-disable threshold (consecutive-failure count + minimum elapsed time). Exists so the sweep job, the delivery worker, and unit tests all read the same table instead of duplicating timing constants.

## Key elements

- **`WEBHOOK_RETRY_DELAYS_MS`** — `readonly number[]` of per-tier delays in ms (5 s, 5 m, 30 m, 2 h, 10 h). Index 0 is the wait *after* attempt 1 fails (1-based indexing).
- **`WEBHOOK_MAX_ATTEMPTS`** — Total attempts a delivery receives (initial try + one per tier).
- **`nextRetryDelayMs(failedAttempt)`** — Returns the delay for the next retry or `undefined` when all tiers are exhausted.
- **`nextAttemptAt(failedAttempt, now?)`** — Returns a `Date` to stamp onto `nextAttemptAt` in the repository, or `undefined` when exhausted. `now` is injectable for tests.
- **`WEBHOOK_MAX_CONSECUTIVE_FAILURES`** — Number of consecutive exhausted retry chains required before auto-disable is considered.
- **`WEBHOOK_MIN_FAILING_MS`** — Minimum wall-clock duration (3 days) a failure streak must span before auto-disable fires.
- **`shouldAutoDisable(consecutiveFailures, failingSince, now?)`** — Dual-gate check: both the chain count **and** the time floor must be met. Returns `false` if `failingSince` is `undefined`.

## Relationships

- **`rules.generated.ts`** — Source of the actual numeric values (`retryRules.delaysMs`, `autoDisableRules.maxConsecutiveFailures`, `autoDisableRules.minFailingMs`), generated from `rules.yaml`. This file re-exports them under stable names.
- **`domain/index.ts`** — Barrel re-export; makes the constants and helpers importable at the module level.
- **`services/attempt.ts`** — Consumer that calls `nextAttemptAt` / `shouldAutoDisable` when recording a delivery outcome and scheduling (or not) the next row.
- **`tests/unit/backoff.test.ts`** — Unit tests exercising the delay lookup, exhaustion boundary, and the dual-gate auto-disable logic with injected clocks.

## Notes

- Values are **generated** from `rules.yaml`; do not edit the numbers here—update the YAML and regenerate.
- The 1-based indexing convention (`failedAttempt` = the attempt that *just* failed) is easy to off-by-one against.
- Backoff granularity is the **sweep interval**, not exact timing—the comments explicitly state these are the *shape* of the backoff, not a precision guarantee.
- The 3-day floor (`WEBHOOK_MIN_FAILING_MS`) exists specifically so a platform-side outage that exhausts the ~12.5 h retry ladder does not mass-disable subscribers whose endpoints are fine.
- `failingSince` is stamped by `repository.ts#recordOutcome` on the first failure after a success and cleared on the next success; this file only *reads* it.
