---
source: src/modules/returns/tests/unit/deadlines.test.ts
sha256: 7d8b748320a817ece5614ab3ad007bf3d898411f344dcab6e84e7ae763e1eb5e
generated_at: 2026-11-08T08:12:21.272159+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/unit/deadlines.test.ts

## Purpose

Unit tests for `frozenDeadlinesOf`, verifying that the withdrawal deadline is shifted one full UTC day past the customer-facing announcement (the "silent grace day") while the guarantee/conformity deadline remains untouched, and that the set of eligible return reasons flips correctly at the grace boundary.

## Key elements

- **`describe('frozenDeadlinesOf')`** – the single test suite in this file.
  - *Moves the withdrawal deadline one UTC day past the announced last day* – asserts `withdrawUntil` is `ANNOUNCED + 1 day` and `conformityUntil` is unchanged.
  - *Leaves a clock that has not started without an end* – asserts `withdrawUntil` is `undefined` when the input object is empty.
  - *Keeps the withdrawal reasons open through the grace day and shuts them after it* – uses `reasonsOpenAt` to confirm `ReturnReason.withdrawal` is still available at the last grace instant but excluded one millisecond later, leaving only `defective` and `wrong_item`.
- **`ANNOUNCED` / `GUARANTEE`** – fixed `Date` constants used as fixtures so tests are deterministic and timezone-independent.

## Relationships

- **`src/modules/returns/services/deadlines.ts`** – provides `frozenDeadlinesOf`, the system under test.
- **`src/modules/returns/domain/index.ts`** – re-exports `reasonsOpenAt`, which is called in the third test to check which reasons are still eligible at a given instant.
- **`src/modules/returns/domain/reasons.ts`** – likely the implementation home of `reasonsOpenAt` (exposed via the domain barrel).
- **`src/types/index.ts`** – supplies the `ReturnReason` enum (`withdrawal`, `defective`, `wrong_item`) used in assertions.

## Notes

- The "silent UTC day" is the product rule under test: the customer sees the announced date, but the real cutoff is end-of-next-UTC-day. Tests pin this with `…59.999Z` timestamps to make the boundary exact.
- The third test asserts the *transition* at a 1 ms boundary (`lastGraceInstant` vs. `+1 ms`), so any off-by-one in the comparison operator inside `reasonsOpenAt` will be caught.
- The empty-input test (`{}`) guards against `frozenDeadlinesOf` inadvertently fabricating a deadline for a clock that was never started.
