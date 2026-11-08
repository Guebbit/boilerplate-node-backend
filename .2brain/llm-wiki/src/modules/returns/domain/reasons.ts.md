---
source: src/modules/returns/domain/reasons.ts
sha256: 7cb3b05144cf5a59fffdbc05cd7f1dc7324acaff8c58d3a5ec89c03cc3f22054
generated_at: 2026-11-08T07:58:11.584025+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/domain/reasons.ts

## Purpose

Pure domain logic that answers one question: *which return reasons is a buyer still allowed to name right now?* It encodes the two statutory clocks (the 30-day withdrawal window and the 2-year guarantee of conformity) without depending on any service, transport, or storage layer.

## Key elements

- **`WITHDRAWAL_WINDOW_REASONS`** — readonly list (`withdrawal`, `other`) tied to the shop's withdrawal period. `other` is explicitly a goodwill return, not a legal right.
- **`CONFORMITY_REASONS`** — readonly list (`defective`, `wrong_item`) tied to the 2-year legal guarantee; unaffected by Art. 16 excluded-goods restrictions.
- **`FrozenDeadlines`** — the minimal input shape: optional `withdrawUntil` / `conformityUntil` dates that the order froze at delivery. Absence means "clock has not started."
- **`reasonsOpenAt(order, now)`** — returns the list of reasons still permissible at `now`, in contract order (withdrawal → conformity → other). Empty once both deadlines have passed.
- **`isGuaranteeReason(reason)`** — boolean check: is this a conformity reason (i.e. not subject to Art. 16 excluded goods)?
- **`isReasonOpen(order, reason, now)`** — convenience wrapper over `reasonsOpenAt` for a single reason.
- **`policyExceptionsOf(order, reason, requestedAt, takesExcludedGoods)`** — computes the `ReturnPolicyException[]` a staff-opened return waives: `window_closed` if the reason's deadline had passed, `excluded_goods` if the return includes Art. 16-excluded lines *and* the reason is not a guarantee reason.

## Relationships

- **`src/types/index.ts`** — source of the `ReturnReason` and `ReturnPolicyException` types imported here.
- **`src/modules/returns/domain/index.ts`** — barrel file; re-exports this module for consumers.
- **`src/modules/returns/services/deadlines.ts`** — computes the `FrozenDeadlines` values that this module reads.
- **`src/modules/returns/services/options.ts`** — calls `reasonsOpenAt` to build the list of selectable reasons presented to a buyer.
- **`src/modules/returns/services/create.ts`** — validates a buyer-submitted reason via `isReasonOpen` before persisting.
- **`src/modules/returns/services/receive.ts`** — calls `policyExceptionsOf` when staff open a return outside the normal window.
- **`src/modules/returns/services/notify.ts`** — may inspect `isGuaranteeReason` to pick the correct notification template.
- **`src/modules/returns/tests/unit/domain.test.ts`** — unit-tests every export in this file.
- **`src/modules/returns/tests/unit/deadlines.test.ts`** — tests the deadline computation that feeds `FrozenDeadlines` into this module.

## Notes

- **`undefined` ≠ expired.** A missing deadline means the clock hasn't started yet; `isOpen` treats that as "still open." Only a concrete `Date` in the past closes a window.
- **Order in `reasonsOpenAt` is intentional** ("contract order"): `withdrawal` first, then the two conformity reasons, then `other`. Consumers that display reasons to users rely on this sequence.
- **`policyExceptionsOf` is the only function that can return a non-empty array.** All other functions are simple queries. It exists solely for the staff-opened-return path; buyer-opened returns never record exceptions.
- **Pure & side-effect free.** No I/O, no config reads, no date-locale dependencies. Safe to call in any context.
