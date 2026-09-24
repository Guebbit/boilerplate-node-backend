---
source: src/modules/webhooks/tests/unit/backoff.test.ts
sha256: 06647fc4584ccc2674a4aa5801651f2ac8c2755de4bf133d45ac4c50beafb944
generated_at: 2026-09-23T19:44:48.687334+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/tests/unit/backoff.test.ts

## Purpose

Unit tests for the pure retry-backoff rules of the webhooks module: the per-tier delay schedule, the max-attempt invariant, next-attempt timestamp calculation, and the auto-disable threshold. It exists to lock down the "when do we retry / when do we give up" contract without any I/O or framework coupling.

## Key elements

- **`describe('nextRetryDelayMs')`** — verifies the 1-based tier lookup returns the correct delay, returns `undefined` past the last tier (exhaustion signal), and that the delay array is strictly monotonically increasing.
- **`describe('WEBHOOK_MAX_ATTEMPTS')`** — asserts the invariant `MAX_ATTEMPTS === RETRY_DELAYS_MS.length + 1` (one initial try + one per retry tier).
- **`describe('nextAttemptAt')`** — checks that the returned `Date` equals `clock + tierDelay`, returns `undefined` past the last tier, and falls back to the real wall clock when no `now` argument is supplied.
- **`describe('shouldAutoDisable')`** — covers the AND-gate: returns `false` below the failure-count threshold, `false` below the time floor, `false` when `failingSince` is `undefined`, `true` only when **both** the count and time thresholds are met (inclusive at the floor), and defaults to the real clock when `now` is omitted.

## Relationships

- **`src/modules/webhooks/domain/backoff.ts`** — the implementation under test. All constants (`WEBHOOK_RETRY_DELAYS_MS`, `WEBHOOK_MAX_ATTEMPTS`, `WEBHOOK_MAX_CONSECUTIVE_FAILURES`, `WEBHOOK_MIN_FAILING_MS`) and functions (`nextRetryDelayMs`, `nextAttemptAt`, `shouldAutoDisable`) originate here.
- **`src/modules/webhooks/domain/index.ts`** — the barrel re-export that this file imports from via `@modules/webhooks/domain`. The test consumes the public API surface, not the module directly.

## Notes

- **1-based vs 0-based:** `nextRetryDelayMs(attempt)` is 1-based while the underlying array is 0-based. The tests iterate `entries()` and add 1; off-by-one here is the most likely regression this file guards against.
- **Real-clock fallback tests use a window, not a mock:** The "defaults to the real clock" cases capture `Date.now()` before and after the call and assert the result falls in `[before + delay, after + delay]`. This avoids freezing/mocking `Date` while still proving the default path is exercised.
- **`shouldAutoDisable` is inclusive at the time floor:** A streak that has lasted *exactly* `WEBHOOK_MIN_FAILING_MS` triggers auto-disable (not "strictly greater than"). The test explicitly pins this boundary.
- **`failingSince === undefined` is not the same as "streak just started":** it means no streak is open at all and the function short-circuits to `false` regardless of the count.
