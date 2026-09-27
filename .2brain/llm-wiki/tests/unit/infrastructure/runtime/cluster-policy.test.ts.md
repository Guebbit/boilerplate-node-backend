---
source: tests/unit/infrastructure/runtime/cluster-policy.test.ts
sha256: a73ac2ac421c85dad96fb601d0118035b684f262f407cb06b9728a2ed6039c24
generated_at: 2026-09-27T16:09:45.840726+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/runtime/cluster-policy.test.ts

## Purpose

Unit tests for `cluster-policy`, the module that decides how many worker processes the primary fork and how it reacts when a worker crashes. It pins down the arithmetic and policy logic without touching any real process management.

## Key elements

- **`describe('workerTarget')`** — three cases verifying the fork-count rule:
  - Positive `count` is returned as-is.
  - `count === 0` is treated as "auto" → returns the available-CPU argument.
  - Negative or zero CPU input still yields a minimum of `1`.

- **`describe('crashVerdict')`** — five cases exercising the crash-retry policy object `{ windowMs, backoffBaseMs, backoffMaxMs, maxCrashes }`:
  - First crash in window → `action: 'respawn'`, `delayMs: backoffBaseMs`.
  - Subsequent in-window crashes double the delay per crash (`500 → 2000` for two prior).
  - Timestamps older than `windowMs` are pruned; the returned `recentCrashes` array contains only in-window entries.
  - Delay is capped at `backoffMaxMs`.
  - Once the in-window crash count exceeds `maxCrashes`, the verdict flips to `action: 'give-up'`.

## Relationships

- **Imports** `crashVerdict` and `workerTarget` from `src/infrastructure/runtime/cluster-policy.ts` (the module under test). No other files are referenced.

## Notes

- The `crashVerdict` tests pass timestamps relative to a shared "now" of `1_000_000` ms and use `windowMs: 60_000`, so in-window means the timestamp is within the last 60 s of `now`. Timestamps like `999_000` and `999_500` are in-window; `1` and `2` are not.
- The "forgets old crashes" test also asserts on the `recentCrashes` return field, confirming the function returns the filtered list, not just an action.
- The "caps the delay" test swaps in a wider `maxCrashes` (10) and a lower `backoffMaxMs` (1000) to isolate the cap from the give-up path.
