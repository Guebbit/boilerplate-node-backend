---
source: src/modules/returns/domain/index.ts
sha256: 9bbe89a1ed725300f152c01a1fdd45c6b963b57f4f9d8fca5de29781343203d2
generated_at: 2026-11-14T21:33:07.202061+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/domain/index.ts

## Purpose

Barrel export for the returns **domain layer**. It re-exports every public symbol (values and types) from the individual domain submodules so that consumers can import from a single path (`returns/domain`) without reaching into each file. The module doc-comment asserts this layer contains pure business rules only — no Express, Mongoose, or other tier dependencies — a constraint enforced by lint.

## Key elements

- **Lifecycle** — `RETURN_EVENTS`, `returnLifecycle`, status constants (`QUANTITY_HOLDING_RETURN_STATUSES`, `BACK_RETURN_STATUSES`), `holdsReturnedGoods`, `handsUnitsBack`, `initialStatusFor`; types `ReturnEvent`, `ReturnStatus`, `ReturnReason`, `ReturnKind`, `ReturnRemedy`.
- **Quantities** — `returnableQuantities`, `quantitiesByProduct`, `returnableLinesOf`, `wireLines`, `checkRequestedLines`, `takesLastUnit`; types `ProductQuantity`, `LinesVerdict`.
- **Reasons** — `CONFORMITY_REASONS`, `WITHDRAWAL_WINDOW_REASONS`, `isGuaranteeReason`, `isReasonOpen`, `policyExceptionsOf`, `reasonsOpenAt`; type `FrozenDeadlines`.
- **Statement** — `checkStatement`; types `Statement`, `StatementInput`, `StatementVerdict`.
- **Restock** — `resolveRestock`; types `RestockRequest`, `RestockVerdict`.
- **Status projection** — `projectReturnStatus`; types `ProjectedReturn`, `ProjectedReturnStatus`.
- **Refund amount** — `refundAmountFor`, `cancellationRefundFor`, `shippingStillOwed`; types `RefundInputs`, `RefundBreakdown`, `RefundVerdict`, `CancellationInputs`.
- **Accounting** — `accountsOf`; types `AccountedReturn`, `OrderAccounts`.
- **Refund due** — `PROOF_OPENS_REFUND_FOR`, `proofOpenedRefund`, `proofOpensRefund`, `refundDueByOf`; types `RefundDueInput`, `ReturnRefundDue`.

## Relationships

- **Re-exports from** every sibling in `src/modules/returns/domain/`: `lifecycle`, `quantities`, `reasons`, `statement`, `restock`, `status-projection`, `refund-amount`, `accounting`, `refund-due`. This file defines no logic of its own; it is a pure re-export surface.
- **Consumed by** `src/modules/returns/index.ts` (module-level barrel), `src/modules/returns/repository.ts`, and the services under `src/modules/returns/services/` (`cancel-remainder`, `cancel-right`, `cancel`, `cancellation-refund`), all of which import domain symbols through this index rather than the sub-files directly.

## Notes

- Adding a new domain submodule requires a matching `export` block here for the surface to be visible to upper layers.
- The "pure rules only / lint-guaranteed" claim means you should not import Express, Mongoose, or other tier modules *through* this path; a lint rule (referenced in `docs/theory/domain-layer.md`) enforces that.
- Because this is a barrel, tree-shaking depends on the bundler honouring ESM named re-exports; in practice most consumers import specific names, so the full surface is not a runtime cost.
