---
source: src/modules/returns/services/deadlines.ts
sha256: 09a492b7864c1f1612f3c41ec35f1c5559e6035486e93e0c25cb51bd99eecf07
generated_at: 2026-10-29T05:42:15.710701+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/services/deadlines.ts

## Purpose

Normalizes an order's stored deadline fields into the `FrozenDeadlines` shape that the returns reason-judging logic expects. The key transform: the order records the *last day* a buyer is told for withdrawal, but the deadline actually closes one silent day later; this file applies that shift so downstream checks operate on the true close instant.

## Key elements

- **`frozenDeadlinesOf(order)`** — The sole export. Accepts a `Pick<OrderDocument, 'withdrawUntil' | 'conformityUntil'>` and returns a `FrozenDeadlines` object. `withdrawUntil` is passed through `withdrawalClosesAt` (or left `undefined`); `conformityUntil` is copied verbatim.

## Relationships

- **`@modules/orders` (index)** — Imports the `withdrawalClosesAt` helper and the `OrderDocument` type. The helper's implementation lives in `src/modules/orders/domain/withdrawal.ts`; the type is declared in `src/modules/orders/model.ts`.
- **`src/modules/returns/domain/index.ts`** — Provides the `FrozenDeadlines` type that this function returns.
- **`src/modules/returns/domain/reasons.ts`** — Consumes the returned object via `reasonsOpenAt` / `isReasonOpen` (per the JSDoc cross-reference).
- **`src/modules/returns/tests/unit/deadlines.test.ts`** — Unit tests for `frozenDeadlinesOf`.

## Notes

- The one-day offset for withdrawal is **not** stored on the order; it is derived at read time by `withdrawalClosesAt`. If that helper's semantics change, every call site through this function shifts accordingly.
- `conformityUntil` requires no transform — the order already stores the exact close instant for that deadline.
