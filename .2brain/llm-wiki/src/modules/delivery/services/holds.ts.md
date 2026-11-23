---
source: src/modules/delivery/services/holds.ts
source_sha256: e3af14d86f3914802741557f59d93126e05cf8463316f7caa0c7d4602769687a
context_sha256: e4d9af5c83ba899e7367b5179880cfd8a05ca82a72757e61f73f92d1c28e4aba
generated_at: 2026-11-22T04:55:20.651619+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/services/holds.ts

## Purpose
Implements holding a fulfillment order back from shipping and releasing it again. Staff may hold for `incorrect_address`, `high_risk` or `other`. The `awaiting_stock` reason is set and released only by stock allocation, so staff can neither set nor release it. This is a consistency guard against shipping goods the stock ledger never counted out, not an administrator policy.

## Key elements
- `HoldInput`: the hold request. It has `reason` (any `FulfillmentHoldReason` except `awaiting_stock`), an optional staff-facing `note`, and an optional buyer-facing `message` that is mailed with the hold.
- `holdFulfillmentOrder(id, input, authContext, context)`: public entry point for placing a hold. It audits as `ADMIN_FULFILLMENT_ORDER_HELD`.
- `releaseFulfillmentOrder(id, authContext, context)`: public entry point for releasing a hold. It audits as `ADMIN_FULFILLMENT_ORDER_RELEASED`.
- `holdAct`: the in-transaction hold step.
  - It reads the fulfillment order with its order, then checks `isWorked` and `isHoldable`.
  - It claims the record at its current `revision`, setting `status` from `statusOfLines(lines, true)`, plus `holdReason`, `heldAt` and the optional `holdNote` and `holdMessage`.
  - It then calls `reportProgress` and `announceHeld`.
- `releaseAct`: the in-transaction release step.
  - It checks `isWorked` and `isReleasable`.
  - It claims the record with `status` from `statusOfLines(lines, false)` and unsets `holdReason`, `heldAt`, `holdNote` and `holdMessage`.
  - It then calls `reportProgress` and `announceReleased`.
- `guarded`: shared wrapper.
  - It runs the act through `runAct`, returns the reject if the act was refused, and otherwise records a success audit.
  - It re-fetches the order and returns `viewFulfillmentOrder(...)` wrapped in `generateSuccess`.
- `isWorked`: true only while the order is awaiting goods (`isAwaitingGoods(order.status)`). A hold or release on a delivered or canceled order is refused.

## Relationships
- `./act`: provides `readWithOrder`, `refuse` and `runAct`, which handle the transaction, the read and the 409 refusals.
- `../repository`: the fulfillment order repository, used to perform the revision-checked update (`claim`) in both acts.
- `../domain`: supplies `isHoldable`, `isReleasable` and `statusOfLines`.
- `./progress`: `reportProgress` is called after each claim.
- `./announce`: `announceHeld` and `announceReleased` notify after each claim.
- `./actions`: `viewFulfillmentOrder` builds the response, including its `actions`.
- `../audit`: `deliveryAuditActions` names the audit actions.
- `@infrastructure/observability/audit`: `recordAudit` writes the audit entry.
- `@infrastructure/http/response`: `generateSuccess` and the `ResponseSuccess` and `ResponseReject` types.
- `@modules/orders`: `isAwaitingGoods` and `OrderDocument`; the module's order service is also used to re-fetch the order for the response.
- `../model`: `FulfillmentOrderDocument`.

## Notes
- Refusals are 409s: `DELIVERY_NOT_HOLDABLE` or `DELIVERY_NOT_RELEASABLE`. They are raised either when the state checks fail or when `claim` returns nothing (a concurrent change on `revision`).
- The audit `metadata` holds only `fulfillmentOrderId` and the reason code, never `holdNote`. The note is free text, and it would reach Loki unhashed.
- On release, the reason is read from the record before the write, because `released` no longer carries it.
- The release comment says an `awaiting_stock` hold is refused. In this file the refusal comes only from `isReleasable`, whose logic lives in the domain module.
- The final response prefers a freshly fetched order and falls back to the one read inside the transaction.
