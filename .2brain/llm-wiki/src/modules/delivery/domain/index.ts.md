---
source: src/modules/delivery/domain/index.ts
sha256: 283de5e584138d51ece82714432886cc0f7fdb5350fb2e38af107e40f4becdfa
generated_at: 2026-11-08T05:28:39.656454+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/domain/index.ts

## Purpose

Barrel (re-export) file that exposes the full public API of the delivery **domain layer** — the business rules, pricing logic, and state predicates — as a single importable surface, independent of the module's HTTP-facing code. It exists so that consumers (services, presenters, repositories) can pull domain rules without reaching into individual sub-module paths.

## Key elements

- **hold-notice** — `holdNoticeOf`, `holdNeedsBuyerNotice`: determine whether a hold requires a buyer-facing notice.
- **rates** — `SHIPPING_METHODS`, `findShippingMethod`, `priceShipping`, `quoteMethod`, `methodFitsWeight`, `cheapestStandardShipping` + `StaticShippingMethod` type: shipping-method lookup, weight fitting, and price calculation.
- **fulfillment** — `groupOrderLines`, `remainingOf`, `remainingOfLine`, `remainderLines`, `statusOfLines`, `checkShipLines`, `withShipped`, `withRemainderCanceled`, `summarize`, `isShippable`, `isFulfillable`, `isHoldable`, `isReleasable` + 8 supporting types: order-line grouping, partial-ship bookkeeping, remainder cancellation, and eligibility predicates.
- **lost** — `withLoss`, `withRestoration`, `planRestoration`, `owedDateOf` + 4 types: mark a shipment lost, plan and apply restoration, compute owed dates.
- **reship** — `planReopening`, `shareOwed` + 2 types: plan a reopening/reshipment and apportion owed amounts.
- **tracking** — `isAwaitingTracking` + `TrackingFacts` type: predicate for shipments still waiting on a tracking number.
- **preorder** — `judgeSlip`, `judgeMove`, `expectedDateOf`, `expectedDateOfWaiting`, `needsDueNotice`, `DUE_NOTICE_LEAD_MS`, `slippedDays`, `promisedAfterNotice`, `boardStateOf`, `isLate` + 5 types: due-date math, slip/move verdicts, due-notice thresholds, and board-state classification.

## Relationships

- **Re-exports from (all same-directory domain files):** `hold-notice.ts`, `rates.ts`, `fulfillment.ts`, `lost.ts`, `reship.ts`, `tracking.ts`, `preorder.ts`. This file adds no logic; it is the aggregate entry point for those seven modules.
- **Consumed by (module-level files in `src/modules/delivery/`):** `index.ts` (module barrel), `model.ts`, `presenter.ts`, `repository.ts`, and the service files `actions.ts`, `announce.ts`, `cancel-remainder.ts`, `cut.ts`. These import domain rules and types through this barrel rather than reaching into individual sub-paths.

## Notes

- Pure re-export: zero own logic. Any change to a sub-module's exports must be mirrored here or consumers break.
- The JSDoc header references `docs/theory/domain-layer.md` for the architectural rationale behind separating domain rules from the HTTP surface.
- `DUE_NOTICE_LEAD_MS` is the only exported **constant** (not a function/type) in this file; treat it as configuration consumed by `preorder` logic.
- The `fulfillment` re-export block is the largest; it accounts for roughly half of the symbols surfaced here.
