---
source: tests/unit/payments-retry-delay.test.ts
sha256: b03a7d7327a1674fde0c0fcc741606fb9071701333bc31221c66578041bf31cf
generated_at: 2026-11-08T10:28:50.207035+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/payments-retry-delay.test.ts

## Purpose

Unit tests for `nextRefundAttemptAt`, verifying the refund retry-delay contract: the wait doubles per refusal, is capped at 24 hours, and the function returns `undefined` when the refusal code is terminal (no further retry is warranted).

## Key elements

- **`NOW`** — a frozen `Date` (`2026-01-01T00:00:00Z`) used as the reference "current time" so all assertions are deterministic.
- **`describe('nextRefundAttemptAt')`** — the sole test block, containing three cases:
  - *doubles the base wait with every refusal* — asserts 5 → 10 → 20 min for attempts 1–3 with a 5-min base.
  - *never waits more than a day* — asserts the result equals exactly 24 h even at attempt 30.
  - *answers nothing for a final refusal* — asserts `undefined` when the refusal code is `'declined'`.

## Relationships

- **`src/modules/payments/domain/index.ts`** — the module from which `nextRefundAttemptAt` is imported (`@modules/payments/domain`); this file exercises only that public export.
- **`src/modules/payments/domain/lifecycle.ts`** — the likely implementation home of `nextRefundAttemptAt`; the tests pin its behavioral contract (exponential backoff, 24-h cap, terminal-code short-circuit).

## Notes

- The test hard-codes a base wait of **5 minutes** and checks delays in whole minutes; it does not exercise sub-minute or zero-base edge cases.
- The "final refusal" case uses the literal code `'declined'`; the "cap" case uses `'unknown'`. The set of codes that suppress retries is therefore partially defined by these tests but not exhaustively enumerated here.
- Numeric literal uses the `60_000` separator style (not `60000`), matching the project convention.
