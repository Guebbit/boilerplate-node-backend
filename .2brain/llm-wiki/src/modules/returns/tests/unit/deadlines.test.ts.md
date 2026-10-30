---
source: src/modules/returns/tests/unit/deadlines.test.ts
sha256: 7d8b748320a817ece5614ab3ad007bf3d898411f344dcab6e84e7ae763e1eb5e
generated_at: 2026-10-29T05:50:22.861617+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/unit/deadlines.test.ts

## Purpose
Unit tests for `frozenDeadlinesOf`, verifying that the withdrawal deadline is shifted one full UTC day past the consumer-facing "announced" date while the guarantee (conformity) deadline passes through unchanged, and that withdrawal reasons remain selectable only up to and including that grace instant.

## Key elements
- **`frozenDeadlinesOf`** (under test, imported from `../../services/deadlines`) — the single function exercised; takes an object of raw deadlines and returns adjusted ones.
- **`reasonsOpenAt`** (imported from `../../domain`) — used in the third test to assert which `ReturnReason` values are still available at a given instant.
- **`ReturnReason`** (imported from `@types`) — enum values (`withdrawal`, `defective`, `wrong_item`) used in assertions.
- **Fixture constants** `ANNOUNCED` and `GUARANTEE` — fixed UTC instants (end-of-day) that simulate the raw order deadlines.

## Relationships
- **`src/modules/returns/services/deadlines.ts`** — source of `frozenDeadlinesOf`; this file is its direct test.
- **`src/modules/returns/domain/index.ts`** — re-exports `reasonsOpenAt`, which the third test calls to check reason availability.
- **`src/modules/returns/domain/reasons.ts`** — defines the `ReturnReason` values (or the logic behind `reasonsOpenAt`) that the assertions reference.
- **`src/types/index.ts`** — provides the `ReturnReason` type imported as `@types`.

## Notes
- The "one day" shift is a *silent* addition of a full UTC calendar day, not a 24-hour offset; the test uses `23:59:59.999Z` boundaries to pin this.
- The third test checks the boundary at the exact last grace instant **and** one millisecond after it, confirming the reason flips from "open" to "closed" at the +1 ms mark.
- `frozenDeadlinesOf({})` must return `withdrawUntil: undefined` (not `null` or `0`) when no deadline was recorded on the order.
