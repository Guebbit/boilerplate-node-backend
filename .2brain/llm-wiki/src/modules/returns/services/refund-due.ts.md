---
source: src/modules/returns/services/refund-due.ts
source_sha256: 63e07c58c294d569615e38ddefdb39086cdbf0e195025c359fe307d1094dcde7
context_sha256: c0b93a39c6ad1870b8b196b61ea1400d49fa7467dda3c1d62b122948e05ab858
generated_at: 2026-11-22T07:32:14.150510+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/services/refund-due.ts

## Purpose
Computes the legal refund deadline that the `returns` module stamps on a refund when it is opened. The rule table itself is pure and lives in `src/modules/returns/domain/refund-due.ts`. This file adds the one input a domain file cannot reach: the shop's calendar (timezone).

## Key elements
- `refundDueFor(returned, arrived)` is the only export.
  - `returned`: a `Pick<ReturnDocument, 'reason' | 'requestedAt'>`.
  - `arrived`: `{ receivedAt?, proofOfSendingAt? }`, the goods arrival date and the carrier's proof-of-sending date.
  - Returns a `ReturnRefundDue`, or `undefined` when the law sets no deadline for this return.
- When `reason === 'withdrawal'`, it computes `withdrawalDueBy` with `withdrawalRefundDueBy(requestedAt, shopTimezone())`. For any other reason, `withdrawalDueBy` is `undefined`.
- It then delegates to `refundDueByOf({ reason, withdrawalDueBy, ...arrived })`.

## Relationships
- `src/modules/orders/index.ts` (implemented in `src/modules/orders/domain/withdrawal.ts`): supplies `withdrawalRefundDueBy`, the withdrawal deadline calculation.
- `src/modules/shop/index.ts` (implemented in `src/modules/shop/service.ts`): supplies `shopTimezone()`, the calendar the deadline is counted on.
- `src/modules/returns/domain/index.ts` (from `src/modules/returns/domain/refund-due.ts`): supplies `refundDueByOf` and the `ReturnRefundDue` type, where the actual rule table lives.
- `src/modules/returns/model.ts`: supplies the `ReturnDocument` type, used only as a type.
- Sibling services in `src/modules/returns/services/` (`receive.ts`, `cancel-remainder.ts`, `proof.ts`) are neighbors in the dependency graph. This file does not import them, and its content does not show how they relate to it.

## Notes
- The deadline is counted on the shop's calendar, not the customer's, because the refund is the shop's act (Regulation 1182/71 Art. 2(1)).
- The function is not fully pure: it reads the shop timezone via `shopTimezone()` only on the withdrawal path.
- Callers must handle an `undefined` result, which means no legal deadline applies.
