---
source: src/modules/delivery/services/holds.ts
sha256: 39924fc88753953f5241622c115b7a55eb7ded694b04ee29cd3d33e8fdf5f9ac
generated_at: 2026-10-29T03:40:24.784969+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/holds.ts

## Purpose

Implements the hold and release lifecycle for a fulfillment order. Staff can put an order on hold (with a Shopify-style reason code and optional notes) or release it from hold. The file wraps each operation in a Mongoose transaction, enforces preconditions (order still in-flight, fulfillment order in a holdable/releasable state), performs the state write, fires progress and announcement side-effects, records an audit entry, and returns the fulfillment order view.

## Key elements

- **`HoldInput`** – Staff-facing input: `reason` (excludes `awaiting_stock`), optional `note` (internal), optional `message` (buyer-facing).
- **`isWorked`** – Guards that the parent order is still awaiting goods (not delivered/cancelled) before allowing a hold or release.
- **`holdAct`** – Transactional core: reads the fulfillment order + parent order, validates state, writes the held status/reason/timestamps via `fulfillmentOrderRepository.claim` (optimistic-concurrency on `revision`), then calls `reportProgress` and `announceHeld`.
- **`releaseAct`** – Transactional core for the inverse: validates releasability, clears `holdReason`/`heldAt`/`holdNote`/`holdMessage`, restores line-derived status, then calls `reportProgress` and `announceReleased`. Reads the reason code from the pre-write document for the return value.
- **`guarded`** – Shared wrapper: runs the act inside `runAct`, records a success audit entry (reason code only, never free text), fetches the fresh parent order, and shapes the response via `viewFulfillmentOrder`.
- **`holdFulfillmentOrder`** *(exported)* – Public entry point to hold an order.
- **`releaseFulfillmentOrder`** *(exported)* – Public entry point to release an order.

## Relationships

- **`services/act.ts`** – Provides the transaction runner (`runAct`), the in-transaction reader (`readWithOrder`), and the early-return helper (`refuse`).
- **`services/announce.ts`** – `announceHeld` / `announceReleased` fire post-commit notifications (e-mail, timeline events) within the same session.
- **`services/progress.ts`** – `reportProgress` updates the parent order's progress after the hold/release write.
- **`services/actions.ts`** – `viewFulfillmentOrder` shapes the response payload.
- **`repository.ts`** – `fulfillmentOrderRepository.claim` performs the optimistic-concurrency write.
- **`model.ts`** – `FulfillmentOrderDocument` type used throughout.
- **`domain/index.ts`** (re-exports `domain/fulfillment.ts`) – `isHoldable`, `isReleasable`, `statusOfLines` supply the state-machine predicates and line-status computation.
- **`audit.ts`** – `deliveryAuditActions` provides the action enum values for the audit log.
- **`@infrastructure/observability/audit.ts`** – `recordAudit` writes the structured audit entry.
- **`@infrastructure/http/response.ts`** – `generateSuccess` and the `ResponseSuccess`/`ResponseReject` types shape the API response.
- **`@modules/orders`** – `isAwaitingGoods` (lifecycle check), `orderService.getById` (fresh parent order fetch), `OrderDocument` type.

## Notes

- **`awaiting_stock` is off-limits to staff.** It is set and released exclusively by the stock-allocation subsystem. A manual release of such a hold would ship goods the stock ledger never counted out, so `HoldInput.reason` is typed as `Exclude<FulfillmentHoldReason, 'awaiting_stock'>`.
- **Audit metadata omits free text.** The operator log ships to Loki unhashed; only the reason *code* is recorded, never `holdNote` or `holdMessage`.
- **`releaseAct` captures the reason before the write.** After `claim` clears the fields, the reason is no longer on the returned document; it is read from the pre-write `fulfillmentOrder` and returned in the `Changed` record.
- **Optimistic concurrency.** Both acts pass `fulfillmentOrder.revision` to `claim`; a stale revision causes the write to fail and the act short-circuits with a 409.
