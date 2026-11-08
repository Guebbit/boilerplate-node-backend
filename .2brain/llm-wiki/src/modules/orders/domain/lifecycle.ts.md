---
source: src/modules/orders/domain/lifecycle.ts
sha256: 6816fee198881fec7f1c332288451794623c89131066a2fce58617cdfbd2478e
generated_at: 2026-11-08T06:49:12.501364+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/domain/lifecycle.ts

## Purpose

Defines the order status lifecycle: which status may follow which, and which actor may make each move. It imports the generated `OrderStatus` set and layers on the directed edges (events) plus the permitted actor per edge, then exposes guard functions that services call instead of comparing status literals by hand. The file is the single source of truth for "is this transition legal, and by whom."

## Key elements

- **`OrderActor`** — union of `'customer' | 'admin' | 'system' | 'withdrawal'`. `system` is *narrower* than `admin` (moves nobody makes by hand); `withdrawal` is the consumer's statutory right (Directive Art. 9) and reaches `processing` unlike a plain cancel.
- **`OrderEvent`** — interface: `{ from, to, actors }`. The `from` array doubles as the `from` set handed to the conditional write.
- **`ORDER_EVENTS`** — the full transition table (`pay`, `process`, `ship`, `reopen`, `reship`, `deliver`, `fulfillmentComplete`, `expire`, `cancel`, `cancelInFulfillment`). Backward moves (`reopen`, `reship`) are `system`-only.
- **`UNDELIVERABLE_EVENT`** — `processing → canceled` (lost parcel settlement). Deliberately **not** in `ORDER_EVENTS` so it doesn't pollute `statusesLeadingTo(canceled, 'system')`. Has no `actors`; its sole door is `markUndeliverable`.
- **`OrderEventName`** — `keyof typeof ORDER_EVENTS`.
- **`canTransition(from, to, actor)`** — primary guard; delegates to the `defineLifecycle` instance.
- **`isPayable(status)`** — true only for `pending` (the one status with a `system` edge into `paid`).
- **`canProcessOrder(status)`** — true only for `paid`; reads the `process` event's own `from` so the pre-check and the write never disagree.
- **`isAwaitingGoods(status)`** — true for `paid`/`processing`; derived from `ORDER_STATUS_TRAITS` (`stockCommitted && beforeDispatch`).
- **`canShip(status)`** — true only for `processing` (the `from` of both `ship` and `fulfillmentComplete`).
- **`canRecordArrival(status)`** — true for `processing` or `shipped`.
- **`hasShopStarted(status)`** — true for anything past `paid` (including `canceled`).
- **`paymentSettled(status)`** — true for `paid` and later; reads `ORDER_STATUS_TRAITS[status].stockCommitted`.
- **`canOverrideTo(from, to, digitalOnly?)`** — admin forward-only override; uses its own `OVERRIDABLE_SEQUENCE` index check rather than `canTransition`. `digitalOnly` blocks `shipped` as a target.
- **`canOverrideFrom(from)`** *(truncated)* — returns the set of statuses an override from `from` may legally land on.

## Relationships

- **`src/domain-primitives/lifecycle.ts`** — provides `defineLifecycle`, which validates the table at load time and generates the edge-query helpers (`canTransition`, `statusesLeadingTo`, etc.) this file delegates to.
- **`src/modules/orders/domain/status-traits.ts`** — supplies `ORDER_STATUS_TRAITS`; `isAwaitingGoods` and `paymentSettled` read from it rather than re-deriving status sets.
- **`src/modules/orders/domain/index.ts`** — barrel file that re-exports this module's public API.
- **`src/modules/delivery/services/*`** (`actions`, `deliver`, `ensure`, `holds`, `lost`, `process`, `progress`, `ship-gate`) — call the guard functions (`canProcessOrder`, `canShip`, `canRecordArrival`, `isAwaitingGoods`, `paymentSettled`) as pre-conditions before issuing conditional writes.
- **`src/modules/orders/services/actions.ts`** — calls `canTransition` as the universal gate before any status write.
- **`src/modules/orders/services/cancel.ts`** — selects between the `cancel` and `cancelInFulfillment` events; `expire` is reserved for the reservation sweep.
- **`src/modules/orders/services/fulfillment.ts`** — uses `canShip` / `isAwaitingGoods` to decide whether fulfillment work applies.
- **`src/modules/orders/services/override.ts`** — calls `canOverrideTo` and `canOverrideFrom` for admin forward moves.

## Notes

- `system` is **not** a rank above `admin`; it is a *narrower* class meaning "nobody may make this by hand." Do not treat the actor list as a permission hierarchy.
- `UNDELIVERABLE_EVENT` is intentionally excluded from `ORDER_EVENTS`. Adding it would cause `statusesLeadingTo(canceled, 'system')` to include `processing`, making the three system cancel paths in `cancel.ts` match in-fulfillment orders.
- `canOverrideTo` is a **separate rule** from `canTransition` by design: an override must skip the normal `from` gate, so reusing the lifecycle table would defeat the feature.
- `cancel` (from `pending`/`paid`) and `expire` (from `pending`) are distinct events so the reservation sweep's unconditional cancel can never race a simultaneously arriving payment that `cancel` legitimately permits.
- The `from` array on each `OrderEvent` is the **same** set passed to `updateStatusIfIn` in the repository; the table and the write share one source of truth, so a pre-check and the CAS write can never disagree.
- `withdrawal` reaches `processing` (Directive Art. 9 right of withdrawal); an ordinary `customer` cancel does not.
- The file references `docs/theory/tactical-ddd.md` §1 for the underlying design rationale.
