---
source: src/modules/delivery/domain/index.ts
sha256: b6a8522fe19eaa15c07fcd6614912a810962cb2d0ff8f36cdad1fa5225d447e2
generated_at: 2026-10-29T03:33:09.892621+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/domain/index.ts

## Purpose

Barrel (re-export) file for the delivery **domain** layer. It aggregates every public symbol from the individual domain submodules into a single import path, so consumers can pull fulfillment rules, shipping-rate logic, lost-shipment math, preorder scheduling, and related types without reaching into each file. The doc comment makes explicit that this layer is pure rules, importable without the module's HTTP surface (presenter, repository, services).

## Key elements

- **Re-exports from `./hold-notice`** — `holdNoticeOf`, `holdNeedsBuyerNotice` (buyer-notice logic for held items).
- **Re-exports from `./rates`** — `SHIPPING_METHODS`, `findShippingMethod`, `priceShipping`, `methodFitsWeight`, `cheapestStandardShipping`, and the `StaticShippingMethod` type (shipping-method catalog and pricing rules).
- **Re-exports from `./fulfillment`** — order-line grouping, remainder calculation, ship/cancel decisions (`checkShipLines`, `withShipped`, `withRemainderCancelled`), status helpers, and summary builders; types `FulfillmentLine`, `FulfillmentOrderDraft`, `FulfillmentReport`, `ShipLinesVerdict`, `ActionCandidate`, etc.
- **Re-exports from `./lost`** — `withLoss`, `withRestoration`, `planRestoration`, `owedDateOf`; types `LostShipmentFacts`, `OwedDate`, `Restoration`, `RestorableFulfillmentOrder`.
- **Re-exports from `./reship`** — `planReopening`, `shareOwed`; types `ReopenableFulfillmentOrder`, `Reopening`.
- **Re-exports from `./tracking`** — `isAwaitingTracking`, type `TrackingFacts`.
- **Re-exports from `./preorder`** — date/slip judgement (`judgeSlip`, `judgeMove`, `isLate`), due-notice helpers (`needsDueNotice`, `DUE_NOTICE_LEAD_MS`, `promisedAfterNotice`), board-state helpers (`boardStateOf`); types `BoardFacts`, `MoveFacts`, `SlipFacts`, `SlipVerdict`, `SweepFacts`.

## Relationships

- **Upstream (this file imports from):** `fulfillment.ts`, `hold-notice.ts`, `lost.ts`, `preorder.ts`, `rates.ts`, `reship.ts`, `tracking.ts` — each provides the actual implementation; this file only re-exports their named symbols.
- **Downstream (files that import from this index):** `src/modules/delivery/index.ts` (module root), `services/actions.ts`, `services/announce.ts`, `services/cancel-remainder.ts`, `services/cut.ts`, and likely `model.ts` / `presenter.ts` / `repository.ts` — all consume domain rules through this single entry point rather than importing submodules directly.

## Notes

- This file defines **no logic** of its own; it is purely a re-export barrel. Any behavior change lives in one of the seven submodules.
- The doc comment references `docs/theory/domain-layer.md` as the authoritative explanation of the layering contract (domain is importable without the HTTP surface).
- When adding a new domain concept, add the implementation in its own file under `domain/`, then surface the exports here so the rest of the module resolves through a single path.
