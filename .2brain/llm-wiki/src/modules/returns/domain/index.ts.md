---
source: src/modules/returns/domain/index.ts
source_sha256: c001fedd4a6df320dd10315b808ceca62f8f7ebb1d882bf9905dbfb831d839a3
context_sha256: 251fb212d4e7e79b8345d4bccf505b9113a568f534f8295f33830bea0abe53dd
generated_at: 2026-11-22T07:22:55.126659+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/domain/index.ts

## Purpose
Barrel file for the Returns module's domain layer. It re-exports the pure business rules and their types from the sibling domain files, so other code can import from one entry point. The module doc comment says this layer holds pure rules only and is lint-guaranteed to be free of Express, Mongoose and every tier.

## Key elements
The file contains no logic of its own, only re-exports grouped by source file:

- **`./lifecycle`**: `RETURN_EVENTS`, `returnLifecycle`, `QUANTITY_HOLDING_RETURN_STATUSES`, `BACK_RETURN_STATUSES`, `holdsReturnedGoods`, `handsUnitsBack`, `initialStatusFor`. Types: `ReturnEvent`, `ReturnStatus`, `ReturnReason`, `ReturnKind`, `ReturnRemedy`.
- **`./quantities`**: `returnableQuantities`, `quantitiesByProduct`, `returnableLinesOf`, `wireLines`, `checkRequestedLines`, `takesLastUnit`. Types: `ProductQuantity`, `LinesVerdict`.
- **`./reasons`**: `CONFORMITY_REASONS`, `WITHDRAWAL_WINDOW_REASONS`, `isGuaranteeReason`, `isReasonOpen`, `policyExceptionsOf`, `reasonsOpenAt`. Type: `FrozenDeadlines`.
- **`./statement`**: `checkStatement`. Types: `Statement`, `StatementInput`, `StatementVerdict`.
- **`./restock`**: `resolveRestock`. Types: `RestockRequest`, `RestockVerdict`.
- **`./status-projection`**: `projectReturnStatus`. Types: `ProjectedReturn`, `ProjectedReturnStatus`.
- **`./refund-amount`**: `refundAmountFor`, `cancellationRefundFor`, `shippingStillOwed`. Types: `RefundInputs`, `RefundBreakdown`, `RefundVerdict`, `CancellationInputs`.
- **`./accounting`**: `accountsOf`. Types: `AccountedReturn`, `OrderAccounts`.
- **`./refund-due`**: `PROOF_OPENS_REFUND_FOR`, `proofOpenedRefund`, `proofOpensRefund`, `refundDueByOf`. Types: `RefundDueInput`, `ReturnRefundDue`.

## Relationships
- It re-exports from nine sibling files: `lifecycle.ts`, `quantities.ts`, `reasons.ts`, `statement.ts`, `restock.ts`, `status-projection.ts`, `refund-amount.ts`, `accounting.ts` and `refund-due.ts`.
- The other neighbors (`src/modules/returns/index.ts`, `repository.ts`, and the `services/cancel*.ts` files) are listed as graph neighbors. This file's content doesn't show how they use it, so presumably they consume the domain API through this barrel or its siblings.

## Notes
- Type-only exports use `export type`, which keeps them erased at runtime.
- Types such as `ReturnReason`, `ReturnKind` and `ReturnRemedy` are exported from `./lifecycle`, not from `./reasons`.
- New domain rules need an export added here to be part of the public domain surface.
