---
source: src/modules/delivery/domain/index.ts
source_sha256: 1e25acf3186ecb504c73ade9ff0f4279669e9fe4e4782f604e32300c472d740c
context_sha256: 0e94eb39676b0643b5cecce4d9ddfbd5a6dea8dc6920781547279b8b1eadb93d
generated_at: 2026-11-22T04:47:54.247859+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/domain/index.ts

## Purpose
Barrel file for the delivery domain layer. It re-exports the module's business rules (lifecycle, holds, shipping rates, fulfillment, loss/restoration, reship, tracking, preorders) so they can be imported without pulling in the module's HTTP surface. The header comment says the domain is "importable without the module's HTTP surface" and references a lint rule governing this boundary.

## Key elements
The file contains only re-exports (values and types), grouped by source file:

- **`./lifecycle`**: `shipmentLifecycle`, `SHIPMENT_EVENTS`, type `ShipmentEvent`.
- **`./hold-notice`**: `holdNoticeOf`, `holdNeedsBuyerNotice`.
- **`./rates`**: `SHIPPING_METHODS`, `findShippingMethod`, `priceShipping`, `quoteMethod`, `methodFitsWeight`, `cheapestStandardShipping`, type `StaticShippingMethod`.
- **`./fulfillment`**: order-line grouping and remainder helpers (`groupOrderLines`, `remainingOf`, `remainingOfLine`, `remainderLines`), status and summary (`statusOfLines`, `summarize`), shipping checks (`checkShipLines`), state transitions (`withShipped`, `withRemainderCanceled`), predicates (`isShippable`, `isFulfillable`, `isHoldable`, `isReleasable`), plus types such as `FulfillmentLine`, `FulfillmentReport`, `ShipLinesVerdict`, `ActionCandidate`.
- **`./lost`**: `withLoss`, `withRestoration`, `planRestoration`, `owedDateOf`, plus types `LostShipmentFacts`, `OwedDate`, `Restoration`, `RestorableFulfillmentOrder`.
- **`./reship`**: `planReopening`, `shareOwed`, plus types `ReopenableFulfillmentOrder`, `Reopening`.
- **`./tracking`**: `isAwaitingTracking`, type `TrackingFacts`.
- **`./preorder`**: `judgeSlip`, `judgeMove`, `expectedDateOf`, `expectedDateOfWaiting`, `needsDueNotice`, `DUE_NOTICE_LEAD_MS`, `slippedDays`, `promisedAfterNotice`, `boardStateOf`, `isLate`, plus types `BoardFacts`, `MoveFacts`, `SlipFacts`, `SlipVerdict`, `SweepFacts`.

## Relationships
- Re-exports from the eight sibling domain files: `src/modules/delivery/domain/lifecycle.ts`, `hold-notice.ts`, `rates.ts`, `fulfillment.ts`, `lost.ts`, `reship.ts`, `tracking.ts`, `preorder.ts`.
- The other listed neighbors (`src/modules/delivery/index.ts`, `src/modules/delivery/model.ts`, `src/modules/delivery/presenter.ts`, `src/modules/delivery/repository.ts`, `src/modules/delivery/services/actions.ts`, `src/modules/delivery/services/announce.ts`, `src/modules/delivery/services/cancel-remainder.ts`) are linked to this file in the dependency graph. The file itself shows no code that interacts with them. They are presumably consumers of this barrel.

## Notes
- It holds no logic of its own. New domain exports must be added here to be reachable through this entry point.
- Several exported types are "Facts" or "Inputs" shapes (`SlipFacts`, `TrackingFacts`, `SummaryInputs`). This suggests the domain functions take plain data rather than persistence objects, though the file does not confirm that.
