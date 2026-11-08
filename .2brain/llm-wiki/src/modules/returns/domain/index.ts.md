---
source: src/modules/returns/domain/index.ts
sha256: 3da3992d61b23f4e111a3e6bb37ba3618ad9cc1243233edc8e2acc4c9a4c3acb
generated_at: 2026-11-08T07:57:19.506162+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/domain/index.ts

## Purpose

Barrel re-export for the Returns domain layer. It consolidates the public API of eight sibling domain modules (lifecycle, quantities, reasons, statement, restock, status-projection, refund-amount, accounting) into a single import surface, guaranteeing that consumers only see pure rules—no Express, Mongoose, or other framework dependencies.

## Key elements

- **Lifecycle exports** (`./lifecycle`): Status constants (`DECIDABLE`, `RECEIVABLE`, `CLOSABLE`, `CANCELABLE`, `QUANTITY_HOLDING`, `BACK`), helpers `holdsReturnedGoods`, `handsUnitsBack`, `initialStatusFor`, and the core types `ReturnStatus`, `ReturnReason`, `ReturnKind`, `ReturnRemedy`.
- **Quantity exports** (`./quantities`): `returnableQuantities`, `quantitiesByProduct`, `returnableLinesOf`, `wireLines`, `checkRequestedLines`, `takesLastUnit`; types `ProductQuantity`, `LinesVerdict`.
- **Reason/policy exports** (`./reasons`): `CONFORMITY_REASONS`, `WITHDRAWAL_WINDOW_REASONS`, `isGuaranteeReason`, `isReasonOpen`, `policyExceptionsOf`, `reasonsOpenAt`; type `FrozenDeadlines`.
- **Statement exports** (`./statement`): `checkStatement`; types `Statement`, `StatementInput`, `StatementVerdict`.
- **Restock exports** (`./restock`): `resolveRestock`; types `RestockRequest`, `RestockVerdict`.
- **Status projection exports** (`./status-projection`): `projectReturnStatus`; types `ProjectedReturn`, `ProjectedReturnStatus`.
- **Refund-amount exports** (`./refund-amount`): `refundAmountFor`, `cancellationRefundFor`, `shippingStillOwed`; types `RefundInputs`, `RefundBreakdown`, `RefundVerdict`, `CancellationInputs`.
- **Accounting exports** (`./accounting`): `accountsOf`; types `AccountedReturn`, `OrderAccounts`.

## Relationships

- **Re-exports from (upstream):** All eight sibling files listed under Key elements. This file adds no logic; it is purely a forwarding layer.
- **Imported by (downstream):**
  - `src/modules/returns/index.ts` — the module's outer barrel; pulls the domain API outward.
  - `src/modules/returns/repository.ts` — accesses domain types and helpers for persistence mapping.
  - `src/modules/returns/services/cancel.ts`, `cancel-remainder.ts`, `cancel-right.ts`, `cancellation-refund.ts`, `close.ts` — service-layer orchestrators that call the domain functions and types re-exported here.

## Notes

- The module JSDoc explicitly declares a **lint-enforced boundary**: no Express, Mongoose, or other tier imports may leak through this barrel. Treat any violation as a build/lint error, not a style choice.
- Because this file is pure re-export, searching for a symbol's implementation should target the specific sibling file (e.g., `./refund-amount.ts`), not this index.
- Type and value exports are interleaved per section; when extending the domain, add the new `export { … }` / `export type { … }` pair in the corresponding block to keep the grouping readable.
