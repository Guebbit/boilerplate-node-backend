---
source: src/modules/returns/domain/statement.ts
source_sha256: 113b115a65e7ec8b182684650c86687a42cd831d2db217c9d2704a044e889fa1
context_sha256: 682cf0a75c992236115b31ef0cc5bb9ede2c2c3b608ccfbd95ce557f37c47199
generated_at: 2026-11-22T07:24:35.087050+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/domain/statement.ts

## Purpose
Pure domain rule that decides the "statement" a return is written with: the date the buyer made the request or withdrawal (`requestedAt`) and, for withdrawals, the channel used (`statedVia`). Buyers get server-stamped values; staff recording a phone call, email or letter supply them. Timing is judged on the day the statement was sent, not the day the shop read it (CRD Art. 11(2)).

## Key elements
- `StatementInput`: the input to the rule. It holds `byBuyer`, `reason`, `kind`, the optional `requestedAt` and `statedVia` the request carried, `orderCreatedAt` and `now`.
- `Statement`: the stored result, `requestedAt: Date` plus an optional `statedVia` (set on withdrawals only).
- `StatementVerdict`: either `{ ok: true } & Statement`, or `{ ok: false, field, reason }`. The field is `requestedAt` or `statedVia`. The reason is `forbidden`, `required`, `future` or `before-order`.
- `checkStatement(input)`: the exported entry point.
  - **Buyer caller:** sending either field is `forbidden`. Otherwise it returns `requestedAt = now`, plus `statedVia: 'online'` when the reason is `withdrawal`.
  - **Staff caller:** delegates to `staffStatement`.
- `staffStatement` (private):
  - A withdrawal requires both `requestedAt` and `statedVia`.
  - A non-withdrawal forbids `statedVia`.
  - A `cancellation` kind with a non-withdrawal reason forbids `requestedAt`.
  - If `requestedAt` is omitted on a non-withdrawal, it defaults to `now`.
- `rangeRefusal` (private): rejects a staff-given date that is after `now` (`future`) or before `orderCreatedAt` (`before-order`). There is no other backdating limit.

## Relationships
- Imports the `ReturnKind` and `ReturnReason` types from `src/modules/returns/domain/lifecycle.ts`, and the `ReturnStatementChannel` and `StaffStatementChannel` types from `src/types/index.ts`.
- Re-exported through the domain barrel `src/modules/returns/domain/index.ts` for the services and tests. The other neighbors are `src/modules/returns/services/create.ts`, `src/modules/returns/services/cancel-remainder.ts` and `src/modules/returns/services/outcome.ts`, along with `src/modules/returns/tests/unit/domain.test.ts`. Only the type-only imports above are visible in this file, so how each of those files uses the rule is not shown here.

## Notes
- The module is pure: it has no I/O and takes `now` as input.
- Verdicts are returned as values, not thrown. Callers must map `field` and `reason` to their own errors.
- The staff check order is: missing `requestedAt`, then forbidden `requestedAt`, then range, then `statedVia`. The first failure wins.
- Backdating is intentionally unrestricted beyond the order's creation date, because the audit row names the staff member.
