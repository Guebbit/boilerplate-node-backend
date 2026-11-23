---
source: src/modules/returns/tests/unit/deadlines.test.ts
source_sha256: 05e761ede7e0fcd1a6c6265b3f15bfd3ec2c1b854c323aec2632f12a917b3675
context_sha256: 9ad9a23101c8ba0a4c87a8fa3372217136bbbe2e2c66dba6b898bd6e32587640
generated_at: 2026-11-22T07:38:43.776729+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/tests/unit/deadlines.test.ts

## Purpose
Unit tests for how the `returns` module reads deadlines off an order. They pin down that the withdrawal deadline is moved to the instant the window really closes (the announced day plus one silent UTC day), while the guarantee (conformity) deadline stays as given.

## Key elements
- `ANNOUNCED` – constant `2026-03-15T23:59:59.999Z`, the announced last day the withdrawal deadline counts from.
- `GUARANTEE` – constant `2028-03-08T23:59:59.999Z`, the end of the legal-guarantee window.
- `describe('frozenDeadlinesOf')` with three cases:
  - Withdrawal deadline moves to `2026-03-16T23:59:59.999Z` (one UTC day later). `conformityUntil` is returned as the same `GUARANTEE` object (`toBe`).
  - An empty input `{}` leaves `withdrawUntil` unset (asserted with `toBeUndefined`).
  - With the resulting deadlines, `reasonsOpenAt` includes `ReturnReason.withdrawal` at the last grace instant (`2026-03-16T23:59:59.999Z`). One millisecond later it returns exactly `[ReturnReason.defective, ReturnReason.wrong_item]`.

## Relationships
- `src/modules/returns/services/deadlines.ts` – provides `frozenDeadlinesOf`, the function under test.
- `src/modules/returns/domain/index.ts` – provides `reasonsOpenAt`, which is used to check which reasons are open at a given instant.
- `src/modules/returns/domain/reasons.ts` – not imported directly. The `ReturnReason` values (`withdrawal`, `defective`, `wrong_item`) are imported through the `@types` alias, which points at `src/types/index.ts`.
- `src/types/index.ts` – exports `ReturnReason`, which is used in the assertions.

## Notes
- The tests use millisecond-precise boundaries to check the end of the grace day. The window is inclusive at `23:59:59.999Z` and closed one millisecond later.
- After the withdrawal window closes, the reasons that remain open are `defective` and `wrong_item`.
