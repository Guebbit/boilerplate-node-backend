---
source: src/modules/returns/domain/reasons.ts
sha256: 7cb3b05144cf5a59fffdbc05cd7f1dc7324acaff8c58d3a5ec89c03cc3f22054
generated_at: 2026-10-29T05:37:53.539531+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/domain/reasons.ts

## Purpose

Pure domain logic that determines which return reasons a buyer may still cite, based on the two deadlines frozen at delivery (withdrawal window and guarantee of conformity). It encodes Consumer Rights Directive Art. 9/16 and Directive 2019/771 Art. 10 into classification and eligibility checks, with no I/O or side effects.

## Key elements

- **`WITHDRAWAL_WINDOW_REASONS`** (`readonly ReturnReason[]`) — reasons bound to the shop's withdrawal period: `withdrawal` and `other` (goodwill).
- **`CONFORMITY_REASONS`** (`readonly ReturnReason[]`) — reasons backed by the two-year guarantee of conformity: `defective` and `wrong_item`.
- **`FrozenDeadlines`** (interface) — the two optional dates an order froze at delivery: `withdrawUntil?` and `conformityUntil?`. Absent means the clock has not started (right still open).
- **`reasonsOpenAt(order, now)`** — returns the list of reasons still admissible at `now`, in contract order (withdrawal → conformity → other). Empty when both deadlines have passed.
- **`isGuaranteeReason(reason)`** — whether a reason is a conformity guarantee (defect / wrong item) rather than a withdrawal-period reason.
- **`isReasonOpen(order, reason, now)`** — convenience check: is a single reason still admissible?
- **`policyExceptionsOf(order, reason, requestedAt, takesExcludedGoods)`** — classifies what a staff-opened return waived: `window_closed` if the deadline had passed at request time, and `excluded_goods` if a goodwill return touches Art. 16-excluded goods. Guarantee reasons never record `excluded_goods`.

## Relationships

- **`src/types/index.ts`** — provides the `ReturnReason` and `ReturnPolicyException` types consumed here.
- **`src/modules/returns/domain/index.ts`** — barrel that re-exports this module's public surface to the rest of the domain.
- **`src/modules/returns/services/options.ts`** — calls `reasonsOpenAt` to build the list of reasons presented to the buyer.
- **`src/modules/returns/services/create.ts`** — uses `isReasonOpen` / `reasonsOpenAt` to validate the reason on a new return request.
- **`src/modules/returns/services/deadlines.ts`** — computes the `FrozenDeadlines` values passed into this module's functions.
- **`src/modules/returns/services/receive.ts`** / **`src/modules/returns/services/notify.ts`** — consume `policyExceptionsOf` to record or communicate what was waived on a staff-opened return.
- **`src/modules/returns/tests/unit/domain.test.ts`** — unit-tests the classification and eligibility logic.
- **`src/modules/returns/tests/unit/deadlines.test.ts`** — exercises the deadline-frozen scenarios that feed into these functions.

## Notes

- The module is intentionally **pure**: every function is a synchronous, side-effect-free mapping from inputs to outputs. No date-math, no storage, no event emission.
- `isOpen` treats an **absent** deadline as "still open" (the clock has not started), not as "expired." This is the opposite of a null-check-you-might-expect.
- Contract order in `reasonsOpenAt` is deliberate: `withdrawal`, then conformity reasons, then `other`. Callers that render a dropdown or diff against previous state depend on this ordering.
- `other` is a **goodwill** return, not a legal right; it is the only reason that can carry the `excluded_goods` exception.
- Guarantee reasons (`defective`, `wrong_item`) are exempt from Art. 16 goods exclusions by design — `policyExceptionsOf` hard-codes this via `!isGuaranteeReason(reason)`.
