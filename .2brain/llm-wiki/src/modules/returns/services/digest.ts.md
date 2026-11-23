---
source: src/modules/returns/services/digest.ts
generated_at: 2026-11-22T07:29:48.089612+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/services/digest.ts

## Purpose
Computes the two return-related counts used by the daily staff digest: requests still undecided after an allowance, and approved returns whose goods are overdue. It returns counts only. The module doc points to the staff-digest section of the shop-tasks module documentation; the referenced `docs/modules/shop-tasks.md` is not in this repository (the shop-tasks module is `src/modules/shop-tasks/module.ts`).

## Key elements
- `ReturnsDigest` (interface): result shape with `undecided` and `returnsAwaitingGoods`.
- `ReturnsDigestAllowances` (interface): inputs `decisionDays` and `sendBackOverdueDays`.
- `returnsDigest(now, allowances)`: runs two `returnRepository.count` queries in parallel with `Promise.all` and resolves to a `ReturnsDigest`.
  - **undecided**: status is `requested` and `createdAt` is at or before `now - decisionDays`.
  - **returnsAwaitingGoods**: status is `approved`, kind is `return`, and `proofOfSendingAt` does not exist. It also needs one of these:
    - reason `withdrawal` with `requestedAt` at or before the overdue cutoff.
    - reason `defective` or `wrong_item` with `decidedAt` at or before the overdue cutoff.

## Relationships
- `@domain-primitives/time` (`src/domain-primitives/time.ts`): supplies `DAY_MS` for converting day allowances to milliseconds.
- `../repository` (`src/modules/returns/repository.ts`): supplies `returnRepository`, whose `count` method runs both queries.
- `@types` (`src/types/index.ts`): supplies the `ReturnKind`, `ReturnReason` and `ReturnStatus` enums used in the filters.
- `src/modules/returns/services/index.ts` is a neighbor in the graph. This file does not import it, so the link is likely a re-export or aggregation there, but that isn't visible here.

## Notes
- The overdue clock differs by reason. For withdrawals it starts at `requestedAt`, when the buyer stated the withdrawal. For faulty or wrong items it starts at `decidedAt`, when staff approved. In both cases this is when the buyer's days to send the goods began.
- The "no goods" condition is checked only through the absence of `proofOfSendingAt`. The query has no separate received-goods check.
- `now` is passed in rather than read from the clock, so results are deterministic for a given instant.
