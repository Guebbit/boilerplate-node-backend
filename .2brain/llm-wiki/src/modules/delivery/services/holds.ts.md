---
source: src/modules/delivery/services/holds.ts
sha256: 38760c12b21bcb89b4244fa582a7e4577498dc45afd2c1ecab794ecd1d06b8d0
generated_at: 2026-10-14T15:30:22.205324+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/holds.ts

## Purpose

Implements the two staff-facing acts that stop or resume a fulfillment order: **holding** (with a Shopify-style reason and optional note) and **releasing**. Both acts run inside a Mongoose transaction, enforce optimistic-concurrency via a revision check, and are gated behind the delivery "rank rule" before any state change is committed.

## Key elements

- **`HoldInput`** (exported interface) – shape of the hold request: `reason` (excludes `awaiting_stock`) and optional `note`.
- **`holdFulfillmentOrder`** (exported) – public entry point for placing a hold. Delegates to the shared `guarded` wrapper with the `holdAct` transaction.
- **`releaseFulfillmentOrder`** (exported) – public entry point for clearing a hold. Delegates to `guarded` with the `releaseAct` transaction.
- **`guarded`** (module-private) – common orchestration: loads the fulfillment order and its parent order (read-only, outside the transaction), checks the rank rule via `orderService.outrankedRefusalFor`, runs the act, records an audit entry, and shapes the success response through `viewFulfillmentOrder`.
- **`holdAct` / `releaseAct`** (module-private) – the in-transaction work: read-then-write via `fulfillmentOrderRepository.claim` (optimistic revision), update status through `statusOfLines`, set or unset `holdReason`/`holdNote`, call `reportProgress`, then `announceHeld`/`announceReleased`.
- **`readForHold` / `isWorked`** (module-private) – shared pre-checks: the fulfillment order and parent order must exist and the order must be in `paid` or `processing` status.

## Relationships

- **`./act`** – `runAct` wraps each act in a Mongoose transaction; `refuse` / `refuseMissing` produce the 409 / 404 rejection objects.
- **`../repository`** – `fulfillmentOrderRepository.findInSession` (read in session) and `.claim` (conditional update with revision) are the only write paths.
- **`../domain`** – `isHoldable`, `isReleasable`, and `statusOfLines` supply the domain rules that gate state transitions and compute the new line status.
- **`../audit`** – `deliveryAuditActions` provides the two audit action constants (`ADMIN_FULFILLMENT_ORDER_HELD`, `ADMIN_FULFILLMENT_ORDER_RELEASED`) recorded via `recordAudit`.
- **`./announce`** – `announceHeld` / `announceReleased` write a timeline entry on the parent order for the staff actor.
- **`./progress`** – `reportProgress` refreshes the order's aggregate progress after the status change.
- **`./actions`** – `viewFulfillmentOrder` shapes the domain document into the API response view (including the caller's available `actions`).
- **`@infrastructure/http/response`** – `generateSuccess` / `generateReject` and the `ResponseSuccess` / `ResponseReject` types define the envelope.
- **`@infrastructure/i18n`** – `t()` translates the 404 messages for missing fulfillment order / order.
- **`@modules/orders`** – `orderService` is used to read the parent order, check rank, and re-read the fresh order for the response view.

## Notes

- **`awaiting_stock` is asymmetric by design.** It can only be set and cleared by the stock-allocation flow, never by staff. `HoldInput` enforces this at the type level (`Exclude<FulfillmentHoldReason, 'awaiting_stock'>`); `releaseFulfillmentOrder` will also 409 if the current hold reason is `awaiting_stock` (via `isReleasable`). This is a consistency guard for the stock ledger, not a permission rule.
- **Two-phase check.** The pre-transaction `guarded` step and the in-transaction `holdAct`/`releaseAct` both verify holdability/releasability. The in-transaction check is the authoritative one; the pre-check exists only to fail fast with a 404 before opening a session.
- **Optimistic concurrency.** `fulfillmentOrderRepository.claim` compares `revision`; a `null` return means another actor won the race and the act returns 409.
- **Audit is recorded only on success**, inside `guarded`, after the transaction commits. Refused acts produce no audit entry here.
