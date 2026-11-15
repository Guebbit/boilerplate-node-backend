---
source: src/modules/orders/domain/lifecycle.ts
sha256: c762e93fd2470ef08b5eee7262ac741eb7fa75d9a82a22a48863513132842227
generated_at: 2026-11-14T20:35:07.555166+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/domain/lifecycle.ts

## Purpose
Single source of truth for the order status lifecycle: which status may follow which, and which actor (`customer`, `admin`, `system`, `withdrawal`) is permitted to make each move. The status *set* comes from the `OrderStatus` enum; this file adds the directed edges and actor restrictions. Services name an event to read the `from`/`to`/`actors` triple rather than hard-coding status comparisons.

## Key elements
- **`OrderActor`** — Union type: `'customer' | 'admin' | 'system' | 'withdrawal'`. `system` means "nobody may make this by hand"; `withdrawal` is the consumer's statutory right (Directive Art. 9).
- **`OrderEvent`** — Interface describing one named move: `from` (statuses it may start from), `to` (destination), `actors` (who may make it).
- **`ORDER_EVENTS`** — Const map of all lifecycle edges keyed by event name (`pay`, `process`, `ship`, `reopen`, `reship`, `deliver`, `fulfillmentComplete`, `expire`, `cancel`, `cancelInFulfillment`). Satisfies `Record<string, OrderEvent>`.
- **`UNDELIVERABLE_EVENT`** — The `processing → canceled` edge for a lost parcel nobody reshipped. Deliberately excluded from `ORDER_EVENTS` to avoid polluting the `statusesLeadingTo` query used by `cancel()`.
- **`OrderEventName`** — `keyof typeof ORDER_EVENTS`; the set of valid event names.
- **`canTransition(from, to, actor)`** — Returns whether the actor may make the move. Stays in the same status is never a transition.
- **`isPayable(status)`** — Whether the order can still be paid (`pending` only).
- **`canProcessOrder(status)`** — Whether fulfillment may start (`paid` only). Keyed on the `process` event's own `from` set so pre-check and conditional write never disagree.
- **`isAwaitingGoods(status)`** — Whether goods are still to be handed over (`paid` or `processing`). Uses `ORDER_STATUS_TRAITS`.
- **`canShip(status)`** — Whether shipping or digital completion is open (`processing` only).
- **`canRecordArrival(status)`** — Whether a shipment's arrival can be recorded (`processing` or `shipped`).
- **`hasShopStarted(status)`** — Whether the order is past `paid` (anything past the first fulfillment move, including `canceled`).
- **`paymentSettled(status)`** — Whether the order's hold should be `committed` or later. Delegates to `ORDER_STATUS_TRAITS`.
- **`canOverrideTo(from, to, digitalOnly?)`** — Forward-only admin override rule using its own `OVERRIDABLE_SEQUENCE` array (`paid → processing → shipped → delivered`). Deliberately separate from `canTransition` so an override can skip a `from` gate.
- **`defineLifecycle`** (imported) — Validates the table at load time and exposes the `canTransition` query.

## Relationships
- **`src/domain-primitives/lifecycle.ts`** — Provides `defineLifecycle`, which this file calls to validate the event table and expose the `canTransition` predicate.
- **`src/modules/orders/domain/status-traits.ts`** — Exports `ORDER_STATUS_TRAITS`; consumed by `isAwaitingGoods` and `paymentSettled` for `stockCommitted` / `beforeDispatch` flags.
- **`src/modules/orders/domain/index.ts`** — Barrel re-export for the `orders/domain` module.
- **`src/modules/orders/services/cancel.ts`** — Reads the `cancel` / `cancelInFulfillment` events and the `from` sets to build conditional writes.
- **`src/modules/orders/services/fulfillment.ts`** — Uses `fulfillmentComplete` and `canShip` to guard digital completion and remainder-cancel flows.
- **`src/modules/orders/services/actions.ts`** — Calls `canTransition` and `canOverrideTo` for actor-authorization and admin-override checks.
- **`src/modules/delivery/services/process.ts`** — Records the `process` move (`paid → processing`) via `markProcessing`, gated by `canProcessOrder`.
- **`src/modules/delivery/services/ship-gate.ts`** — Guards shipment creation behind `canShip`.
- **`src/modules/delivery/services/deliver.ts`** — Records the `deliver` move (`shipped → delivered`).
- **`src/modules/delivery/services/lost.ts`** — Uses `UNDELIVERABLE_EVENT` for `markUndeliverable` and the `reopen` event for a reshipped parcel.
- **`src/modules/delivery/services/holds.ts`** — Checks `isAwaitingGoods` to decide whether a hold applies.
- **`src/modules/delivery/services/ensure.ts`** — Pre-checks before recording delivery progress; reads `canRecordArrival`.
- **`src/modules/delivery/services/progress.ts`** — Tracks per-shipment progress; relies on `canShip` / `canRecordArrival`.
- **`src/modules/delivery/services/actions.ts`** — Higher-level delivery actions that compose the above service calls.
- **`src/modules/orders/domain/fulfillment.ts`** — Domain logic for fulfillment lines; interacts with `canShip` and `fulfillmentComplete`.

## Notes
- **`system` ≠ "higher authority".** It means "nobody may trigger this from a request; it follows a fact another module already recorded." All forward business moves (`pay`, `process`, `ship`, `deliver`, `reopen`, `reship`, `fulfillmentComplete`, `expire`) are `system`-only.
- **Backward moves (`reopen`, `reship`) are `system`-only** so an admin override can never walk an order backward; `canOverrideTo` is forward-only by construction.
- **`UNDELIVERABLE_EVENT` is intentionally outside `ORDER_EVENTS`.** Including it would make `statusesLeadingTo(canceled, 'system')` match `processing`, causing the generic `cancel()` service to start matching in-fulfillment orders.
- **`canProcessOrder` / `canShip` read the event's `from` array directly**, not `canTransition`, so the pre-check and the conditional write (`updateStatusIfIn`) in the repository are guaranteed to use the same `from` set.
- **`canOverrideTo` is a separate rule**, not a widened `canTransition`. It exists to *skip* a `from` gate; reusing the lifecycle table would defeat the override.
- **`digitalOnly` flag** in `canOverrideTo`: a fully-digital order goes `processing → delivered` with no `shipped` intermediate, so `shipped` is excluded as a valid override target.
- The file references `docs/theory/tactical-ddd.md` §1 for the design rationale.
