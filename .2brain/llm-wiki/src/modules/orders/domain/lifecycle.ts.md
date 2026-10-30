---
source: src/modules/orders/domain/lifecycle.ts
sha256: 1874cc30440268ccba469a9fd85a7e1ff90191a2fb15ee96cdf19083f1b10a50
generated_at: 2026-10-29T04:40:01.457252+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/domain/lifecycle.ts

## Purpose

Defines the order lifecycle state machine: which status may follow which, and which actor may make each move. The set of statuses comes from the contract; this file adds the directed edges and their actor permissions. A single source of truth so that services name an event and read its `from`/`to`/`actors` without guessing. Pairs with the conditional-write helper in the repository to ensure only one racing writer wins.

## Key elements

- **`OrderActor`** — union of `'customer' | 'admin' | 'system' | 'withdrawal'`. `system` means "nobody may make this by hand"; `withdrawal` is the consumer's legal right of withdrawal (Directive Art. 9).
- **`OrderEvent`** — interface describing one named move: `from` (statuses it may start from, also the conditional-write filter), `to`, and `actors`.
- **`ORDER_EVENTS`** — the complete table of ten named transitions (`pay`, `process`, `ship`, `reopen`, `reship`, `deliver`, `fulfilmentComplete`, `expire`, `cancel`, `cancelInFulfilment`). `as const satisfies Record<string, OrderEvent>`.
- **`UNDELIVERABLE_EVENT`** — the `processing → cancelled` move for a lost parcel nobody reshipped. Deliberately kept *outside* `ORDER_EVENTS` so it does not pollute `statusesLeadingTo(cancelled, 'system')`.
- **`OrderEventName`** — `keyof typeof ORDER_EVENTS`.
- **`canTransition(from, to, actor)`** — whether a declared edge permits the move. Staying in the same status is never a transition.
- **`isPayable(status)`** — whether a payment attempt should be allowed (i.e. a `system` edge into `paid` exists from `status`).
- **`canProcessOrder(status)`** — whether fulfilment may start; keyed on `ORDER_EVENTS.process.from` so a pre-check and the conditional write can never disagree.
- **`isAwaitingGoods(status)`** — whether the order still has goods to hand over (stock committed AND before dispatch), derived from `ORDER_STATUS_TRAITS`.
- **`canShip(status)`** — whether a shipment may leave or a digital fulfilment may complete; keyed on `ORDER_EVENTS.ship.from`.
- **`canRecordArrival(status)`** — whether a shipment's arrival may be recorded (`processing` or `shipped`).
- **`hasShopStarted(status)`** — whether the order is past `paid` (anything that is neither payable nor processable).
- **`paymentSettled(status)`** — single declaration that an order has been paid (via `ORDER_STATUS_TRAITS.stockCommitted`), used by hold-commit logic.
- **`canOverrideTo(from, to, digitalOnly?)`** — forward-only admin override check against a fixed sequence `[paid, processing, shipped, delivered]`. Deliberately *not* a widened `canTransition`; it exists to skip a `from` gate the normal lifecycle enforces.
- **`overrideTargets(from, digitalOnly?)`** *(truncated)* — every status an override starting from `from` could legally land on.

## Relationships

- **`src/domain-primitives/lifecycle.ts`** — provides `defineLifecycle`, the generic engine that validates the table at load and exposes `canTransition`. This file supplies the domain-specific statuses, events, and actors.
- **`./status-traits.ts`** — `ORDER_STATUS_TRAITS` is consulted by `isAwaitingGoods` and `paymentSettled` for per-status boolean traits.
- **`src/modules/orders/domain/index.ts`** — re-exports this module's public API to the rest of the order domain.
- **`src/modules/orders/services/override.ts`** — calls `canOverrideTo` and `overrideTargets` to gate admin status overrides.
- **`src/modules/orders/services/cancel.ts`** — consults `ORDER_EVENTS.cancel` / `cancelInFulfilment` actor lists and the `from` sets for conditional writes.
- **`src/modules/orders/services/fulfillment.ts`** — uses `isAwaitingGoods`, `canProcessOrder`, `canShip`, `isPayable`, `paymentSettled` to decide whether fulfilment work applies.
- **`src/modules/orders/services/actions.ts`** — reads `ORDER_EVENTS` to dispatch the correct conditional write for a given actor.
- **`src/modules/delivery/services/*`** (`actions`, `deliver`, `ensure`, `holds`, `lost`, `process`, `progress`, `ship-gate`) — the `delivery` module is the sole caller of the `system`-actor events (`pay`, `process`, `ship`, `reopen`, `reship`, `deliver`, `fulfilmentComplete`, `expire`). It reads the event's `from` set as the conditional-write filter and uses `canRecordArrival`, `canShip`, `isAwaitingGoods` as pre-gates.
- **`src/modules/orders/domain/index.ts`** — barrel re-export.

## Notes

- **`UNDELIVERABLE_EVENT` is not in `ORDER_EVENTS` on purpose.** Including it would make `statusesLeadingTo(cancelled, 'system')` return `processing`, causing `cancel()` to match orders mid-fulfilment. Its only entry point, `markUndeliverable`, filters on the `from` set directly.
- **Backward moves (`reopen`, `reship`) are `system`-only.** `canOverrideTo` is forward-only by design; an admin can never trigger a backward move manually.
- **`canOverrideTo` is deliberately separate from `canTransition`.** Reusing the lifecycle table here would defeat the override's purpose of skipping a `from` gate.
- **`canProcessOrder` reads `ORDER_EVENTS.process.from` directly**, not `canTransition`, so a service pre-check and the repository conditional write are guaranteed to agree.
- **`expire` is its own event** (separate from `cancel`) so the reservation-sweep cannot cancel an order that simultaneously received a payment; the sweep matches only the `pending → cancelled` edge with `system` actor.
- **`pending` is not in `OVERRIDABLE_SEQUENCE`.** Leaving `pending` is exclusively the offline-payment door's job (records money, issues invoice).
