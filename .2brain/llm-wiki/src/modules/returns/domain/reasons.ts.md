---
source: src/modules/returns/domain/reasons.ts
source_sha256: 3930ff4d7effcdd0004f3c366cb92f1564ddc6d31100fd71f70c5d417fd5493e
context_sha256: 119fee7025b2be4147121b07360f6c40b066757692b0162447fb30f2ec701831
generated_at: 2026-11-22T07:23:37.991188+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/domain/reasons.ts

## Purpose
Pure domain logic that decides which return reasons a buyer can still give, based on the two deadlines an order froze at delivery: the withdrawal deadline and the conformity (legal guarantee) deadline. It encodes the Consumer Rights Directive Art. 9/16 and Directive 2019/771 Art. 10, and nothing else. It also works out which policy exceptions a staff-opened return waived.

## Key elements
- `WITHDRAWAL_WINDOW_REASONS`: `withdrawal` and `other`. These follow the shop's withdrawal period (30 days by default) and the Art. 16 exclusion. `other` is a goodwill return, not a legal one.
- `CONFORMITY_REASONS`: `defective` and `wrong_item`. These are the legal guarantee, which lasts two years from delivery and also covers made-to-order goods.
- `FrozenDeadlines`: the input shape, with optional `withdrawUntil` and `conformityUntil` dates.
- `reasonsOpenAt(order, now)`: returns the reasons still open, in the order `withdrawal`, conformity reasons, `other`. It returns an empty list once both deadlines have passed.
- `isGuaranteeReason(reason)`: true if the reason is in `CONFORMITY_REASONS`.
- `isReasonOpen(order, reason, now)`: true if the reason appears in `reasonsOpenAt`.
- `policyExceptionsOf(order, reason, requestedAt, takesExcludedGoods)`: returns `ReturnPolicyException[]` for a staff-opened return. It adds `window_closed` if the reason was not open on the day the buyer asked. It adds `excluded_goods` if the return takes Art. 16-excluded goods and the reason is not a guarantee reason.
- The private `isOpen` helper treats a missing deadline as open and a present one as open while `now <= deadline`.

## Relationships
- Imports `ReturnReason` and the `ReturnPolicyException` type from `src/types/index.ts` (via the `@types` alias).
- Sits in the `domain` folder next to `src/modules/returns/domain/index.ts` and `refund-due.ts`. The `index.ts` re-export is not visible in this file.
- The services neighbors (`create.ts`, `deadlines.ts`, `notify.ts`, `options.ts`, `receive.ts`) and the tests (`deadlines.test.ts`, `domain.test.ts`) are linked in the dependency graph. This file's content does not show how each one uses it.

## Notes
- A missing deadline means "not started yet", so the right counts as open. A missing `withdrawUntil` keeps `withdrawal` and `other` open. A missing `conformityUntil` keeps the conformity reasons open.
- The deadline check is inclusive: a request exactly at the deadline instant is still accepted.
- Buyer-opened returns waive nothing. `policyExceptionsOf` is meant for staff-opened returns, and its result depends on the caller passing the right `requestedAt`.
- Art. 16 only removes the right of withdrawal, so `defective` and `wrong_item` never record `excluded_goods`.
