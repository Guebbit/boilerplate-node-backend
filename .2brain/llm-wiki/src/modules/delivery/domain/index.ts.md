---
source: src/modules/delivery/domain/index.ts
sha256: 435ced10aeb04bf211809aca5e21d4cb7d0dcafcd5b5d4d153f5ba9191d0180b
generated_at: 2026-11-14T19:39:26.080980+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/domain/index.ts

## Purpose

Barrel (re-export) file that exposes the delivery domain's full public API—lifecycle, rates, fulfillment, lost-shipment, reship, tracking, and preorder rules—without pulling in the module's HTTP or service surface. It is the single import point consumers use to access domain logic, as described in `docs/theory/domain-layer.md`.

## Key elements

- **Lifecycle** – re-exports `shipmentLifecycle`, `SHIPMENT_EVENTS` (constants) and the `ShipmentEvent` type from `./lifecycle`.
- **Hold notice** – re-exports `holdNoticeOf`, `holdNeedsBuyerNotice` from `./hold-notice`.
- **Shipping rates** – re-exports `SHIPPING_METHODS`, `findShippingMethod`, `priceShipping`, `quoteMethod`, `methodFitsWeight`, `cheapestStandardShipping`, and the `StaticShippingMethod` type from `./rates`.
- **Fulfillment** – re-exports the largest group: `groupOrderLines`, `remainingOf`, `remainingOfLine`, `remainderLines`, `statusOfLines`, `checkShipLines`, `withShipped`, `withRemainderCanceled`, `summarize`, plus guards `isShippable`/`isFulfillable`/`isHoldable`/`isReleasable`, along with 10 related types (`FulfillmentLine`, `FulfillmentOrderDraft`, `FulfillmentReport`, `GroupableLine`, `ProductQuantity`, `WaitCause`, `ShipLinesVerdict`, `SummaryInputs`, `ActionCandidate`) from `./fulfillment`.
- **Lost shipments** – re-exports `withLoss`, `withRestoration`, `planRestoration`, `owedDateOf` and 4 types from `./lost`.
- **Reship** – re-exports `planReopening`, `shareOwed` and 2 types from `./reship`.
- **Tracking** – re-exports `isAwaitingTracking` and `TrackingFacts` from `./tracking`.
- **Preorder / due-notice** – re-exports `judgeSlip`, `judgeMove`, `expectedDateOf`, `expectedDateOfWaiting`, `needsDueNotice`, `DUE_NOTICE_LEAD_MS`, `slippedDays`, `promisedAfterNotice`, `boardStateOf`, `isLate` and 5 types from `./preorder`.

## Relationships

- **Re-exports from (sibling domain files):** `./lifecycle`, `./hold-notice`, `./rates`, `./fulfillment`, `./lost`, `./reship`, `./tracking`, `./preorder`. This file contains no logic of its own; it is purely a re-export surface.
- **Consumed by (upstream in the module):** `src/modules/delivery/index.ts` (module-level barrel), `src/modules/delivery/presenter.ts`, `src/modules/delivery/services/actions.ts`, `src/modules/delivery/services/announce.ts`, `src/modules/delivery/services/cancel-remainder.ts` — all expected to import domain rules through this entry point rather than reaching into individual sibling files.
- **Referenced alongside:** `src/modules/delivery/model.ts` and `src/modules/delivery/repository.ts` sit in the same directory but are *not* re-exported here; they belong to the data-access layer and are kept out of the domain import surface.

## Notes

- This is a **pure re-export file**: adding a new domain concept means creating a sibling `.ts` file *and* adding its exports here. Forgetting the second step makes the symbol invisible to consumers who import via `domain/index`.
- The module doc comment explicitly scopes this as "importable without the module's HTTP surface," signalling that importing from this barrel should never transitively load Express/Fastify handlers or the repository layer.
- `DUE_NOTICE_LEAD_MS` is the only **constant** re-exported from `./preorder`; all other re-exports are functions or types.
- The file uses named `export { … }` / `export type { … }` syntax (no `export *`), so the public API is explicitly curated.
