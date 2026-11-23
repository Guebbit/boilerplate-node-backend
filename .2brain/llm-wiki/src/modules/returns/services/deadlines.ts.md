---
source: src/modules/returns/services/deadlines.ts
source_sha256: f4b0d3bef78b665de71d616cf46c9382936a383b5e92963efdd2bec8bd121189
context_sha256: aeb06143b8d140b8b8048982ab07a787e39471cf46afe3ffafe3544ac5e47edd
generated_at: 2026-11-22T07:29:19.053011+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/services/deadlines.ts

## Purpose
Builds the set of deadlines that the `returns` module checks a return reason against. It takes the deadlines frozen on an order and adjusts the withdrawal one to the moment it actually closes. The order stores the last day the buyer is told, but a withdrawal is still accepted for one silent day after that.

## Key elements
- `frozenDeadlinesOf(order)`: takes an order, typed as `Pick<OrderDocument, 'withdrawUntil' | 'conformityUntil'>`, and returns a `FrozenDeadlines` object.
  - `withdrawUntil` is passed through `withdrawalClosesAt` when the order has one, and is `undefined` otherwise.
  - `conformityUntil` is copied unchanged.
  - Its doc comment says the result is what `reasonsOpenAt` and `isReasonOpen` read.

## Relationships
- `src/modules/orders/index.ts` (and `src/modules/orders/domain/withdrawal.ts`): provides `withdrawalClosesAt`, which applies the extra silent day. `OrderDocument` is a type import from the same index, and `src/modules/orders/model.ts` is in the module's neighbors but is not imported directly here.
- `src/modules/returns/domain/index.ts`: provides the `FrozenDeadlines` type returned by the function.
- `src/modules/returns/domain/reasons.ts`: its `reasonsOpenAt` and `isReasonOpen` are named in the doc comment as the readers of this output. This file does not import them.
- `src/modules/returns/services/create.ts` and `options.ts`: sibling services in the same folder, listed as graph neighbors. Neither is imported here, and the file's content doesn't show how they use it.
- `src/modules/returns/tests/unit/deadlines.test.ts`: unit tests for this file.

## Notes
- The order's stored `withdrawUntil` is the buyer-facing last day. The value returned here is the later real closing instant, so don't compare against the raw order field.
- The module doc comment points to a section named "the-two-deadlines" in the returns module documentation for further background.
