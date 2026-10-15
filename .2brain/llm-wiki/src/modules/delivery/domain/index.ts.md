---
source: src/modules/delivery/domain/index.ts
sha256: 289ce1c051bcea2a8453918c24afcd9ae14de26f1b91281e7070482e59361d95
generated_at: 2026-10-15T10:26:47.358800+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/domain/index.ts

## Purpose

Barrel (re-export) file for the delivery domain layer. It aggregates the public API of the three pure-rule submodules—`rates`, `fulfillment`, and `preorder`—so that consumers can import all domain logic without touching the module's HTTP surface. It exists to give a single, stable import path for the rules while keeping each rule file independently testable.

## Key elements

- **`./rates` re-exports** – `SHIPPING_METHODS`, `findShippingMethod`, `priceShipping`, `methodFitsWeight`, `cheapestStandardShipping`, and the `StaticShippingMethod` type: shipping-method catalog and price/weight computation.
- **`./fulfillment` re-exports** – `groupOrderLines`, `remainingOf` / `remainingOfLine`, `remainderLines`, `statusOfLines`, `checkShipLines`, `withShipped`, `withRemainderCancelled`, `summarize`, and the predicates `isShippable`, `isFulfillable`, `isHoldable`, `isReleasable`, `isAwaitingAnswer`; plus types `FulfillmentLine`, `FulfillmentOrderDraft`, `FulfillmentReport`, `GroupableLine`, `ProductQuantity`, `ShipLinesVerdict`, `SummaryInputs`, `ActionCandidate`. Covers order-line grouping, partial-shipment bookkeeping, and status/action-candidate logic.
- **`./preorder` re-exports** – `SILENT_SLIP_DAYS`, `CONSENT_WINDOW_DAYS`, `judgeSlip`, `answerBy`, `needsDatePassedNotice`, `hasWaitExpired`, `slippedDays`, `boardStateOf`, `isLate`; plus types `BoardFacts`, `SlipFacts`, `SlipVerdict`, `SweepFacts`. Covers preorder slip/judgment, consent windows, and board-state derivation.

## Relationships

- **Re-exports from** `src/modules/delivery/domain/rates.ts`, `src/modules/delivery/domain/fulfillment.ts`, `src/modules/delivery/domain/preorder.ts` – the three sibling files whose symbols are surfaced here.
- **Imported by** `src/modules/delivery/index.ts` (the module's top-level public entry) and the service files under `src/modules/delivery/services/` (`actions.ts`, `cancel-remainder.ts`, `confirm-wait.ts`, `cut.ts`, `ensure.ts`, `fulfill.ts`, `holds.ts`, `notice.ts`), which consume the re-exported rules and types.
- **Not imported by** `model.ts`, `presenter.ts`, or `repository.ts` directly; those operate at a different layer and depend on this barrel only transitively through the services or the module entry.

## Notes

- This file contains **no original logic**—it is purely `export { … } from '…'` re-exports. All behavior lives in the three sub-module files.
- The `@module` doc comment and the pointer to `docs/theory/domain-layer.md` signal an intentional boundary: import from this barrel when you need domain rules, import from the module-level `src/modules/delivery/index.ts` only when you need the HTTP-facing surface.
- Because it is a flat re-export, any name collision across the three sub-modules would break the build at this file. Add new domain symbols by exporting them from the appropriate sub-file first, then listing them here.
