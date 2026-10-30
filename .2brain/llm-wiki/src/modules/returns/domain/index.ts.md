---
source: src/modules/returns/domain/index.ts
sha256: 3da3992d61b23f4e111a3e6bb37ba3618ad9cc1243233edc8e2acc4c9a4c3acb
generated_at: 2026-10-29T05:37:10.122213+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/domain/index.ts

## Purpose

Barrel file for the returns domain layer. It re-exports every public function, constant, and type from the sibling domain modules so that consumers (services, repository, external modules) can import from a single path (`../domain`) instead of reaching into individual files. It contains no logic of its own.

## Key elements

- **Lifecycle exports** — `DECIDABLE_RETURN_STATUSES`, `RECEIVABLE_RETURN_STATUSES`, `CLOSABLE_RETURN_STATUSES`, `CANCELABLE_RETURN_STATUSES`, `QUANTITY_HOLDING_RETURN_STATUSES`, `BACK_RETURN_STATUSES`, `holdsReturnedGoods`, `handsUnitsBack`, `initialStatusFor`, plus types `ReturnStatus`, `ReturnReason`, `ReturnKind`, `ReturnRemedy` (from `./lifecycle`).
- **Quantities exports** — `returnableQuantities`, `quantitiesByProduct`, `returnableLinesOf`, `wireLines`, `checkRequestedLines`, `takesLastUnit`, plus types `ProductQuantity`, `LinesVerdict` (from `./quantities`).
- **Reasons exports** — `CONFORMITY_REASONS`, `WITHDRAWAL_WINDOW_REASONS`, `isGuaranteeReason`, `isReasonOpen`, `policyExceptionsOf`, `reasonsOpenAt`, plus type `FrozenDeadlines` (from `./reasons`).
- **Statement exports** — `checkStatement`, plus types `Statement`, `StatementInput`, `StatementVerdict` (from `./statement`).
- **Restock exports** — `resolveRestock`, plus types `RestockRequest`, `RestockVerdict` (from `./restock`).
- **Status projection exports** — `projectReturnStatus`, plus types `ProjectedReturn`, `ProjectedReturnStatus` (from `./status-projection`).
- **Refund-amount exports** — `refundAmountFor`, `cancellationRefundFor`, `shippingStillOwed`, plus types `RefundInputs`, `RefundBreakdown`, `RefundVerdict`, `CancellationInputs` (from `./refund-amount`).
- **Accounting exports** — `accountsOf`, plus types `AccountedReturn`, `OrderAccounts` (from `./accounting`).

## Relationships

- **Re-exports from (downstream dependencies):** `./lifecycle`, `./quantities`, `./reasons`, `./statement`, `./restock`, `./status-projection`, `./refund-amount`, `./accounting` — all sibling files in `src/modules/returns/domain/`.
- **Re-exported to (upstream consumers):** `src/modules/returns/index.ts` (module public API), `src/modules/returns/repository.ts`, and the services `cancel.ts`, `cancel-remainder.ts`, `cancel-right.ts`, `cancellation-refund.ts`, `close.ts` — all of which import domain rules through this barrel rather than reaching into individual files.

## Notes

- The module docstring explicitly states this layer is **pure rules only** and is lint-guaranteed to be free of Express, Mongoose, and every application tier. Do not add I/O or framework imports here.
- Because this is a pure re-export file, any change to a sibling's public surface (renaming a function, adding a type) must be mirrored here, or upstream consumers will lose the symbol.
- The split between value exports (constants, functions) and `export type` (interfaces, type aliases) is intentional and must be preserved if `isolatedModules` / `verbatimModuleSyntax` is enforced by the build.
