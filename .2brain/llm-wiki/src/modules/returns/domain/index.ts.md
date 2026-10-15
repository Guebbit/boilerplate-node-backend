---
source: src/modules/returns/domain/index.ts
sha256: 3b42e49d69033f27c576a4aaa91188630df856ad1f9961205c97e8c4c4ceee8d
generated_at: 2026-10-15T11:52:20.538091+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/domain/index.ts

## Purpose

Barrel (re-export) file for the returns domain layer. It aggregates all public values and types from the five domain sub-modules into a single import surface, so consumers never need to reach into individual files. The file contains no logic of its own.

## Key elements

- **Lifecycle re-exports** — status-set constants (`DECIDABLE_RETURN_STATUSES`, `RECEIVABLE_RETURN_STATUSES`, `CLOSABLE_RETURN_STATUSES`, `QUANTITY_HOLDING_RETURN_STATUSES`, `BACK_RETURN_STATUSES`), the `holdsReturnedGoods` predicate, `initialStatusFor`, and the `ReturnStatus` / `ReturnReason` / `ReturnKind` types (from `./lifecycle`).
- **Quantities re-exports** — `returnableQuantities`, `returnableLinesOf`, `wireLines`, `checkRequestedLines`, `takesLastUnit`, and the `ProductQuantity` / `LinesVerdict` types (from `./quantities`).
- **Status projection** — `projectReturnStatus` plus `ProjectedReturn` / `ProjectedReturnStatus` types (from `./status-projection`).
- **Refund amounts** — `refundAmountFor`, `cancellationRefundFor`, `shippingStillOwed`, and the `RefundInputs` / `RefundBreakdown` / `RefundVerdict` / `CancellationInputs` types (from `./refund-amount`).
- **Accounting** — `accountsOf` plus `AccountedReturn` / `OrderAccounts` types (from `./accounting`).

## Relationships

- **Re-exports from** `lifecycle.ts`, `quantities.ts`, `status-projection.ts`, `refund-amount.ts`, and `accounting.ts` — the sole sources of every name listed above.
- **Imported by** `src/modules/returns/index.ts` (feature-level barrel) and every service under `services/` (`create`, `decide`, `close`, `cancel-remainder`, `cancellation-refund`, `options`, `outcome`, `projection`) as well as `repository.ts`, giving them a single entry point to all domain rules.

## Notes

- The JSDoc header states the domain layer is "lint-guaranteed free of Express, Mongoose and every tier"; see `docs/theory/domain-layer.md` for the invariant's definition and enforcement.
- Because this file is a pure re-export barrel, adding a new domain sub-module requires a corresponding `export … from '…'` line here for it to be reachable by the rest of the feature.
