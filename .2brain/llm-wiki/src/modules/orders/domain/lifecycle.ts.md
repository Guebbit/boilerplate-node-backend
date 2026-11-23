---
source: src/modules/orders/domain/lifecycle.ts
source_sha256: 631669daed02d5727646e39e1a1df33c94a45888d7671b4ddef4ec7c23470484
context_sha256: eebf9a47904ea86e251b2a72adfe187b3865be4e8046babe84ec4d32afdee14d
generated_at: 2026-11-22T06:12:12.546681+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/domain/lifecycle.ts

## Purpose
Defines the order lifecycle: which status may follow which, and which actor may make each move. The status set itself comes from the contract (`OrderStatus`); this file adds the edges and the actors on each edge, so the two live in one entry. It only decides which `from` set a conditional write (`updateStatusIfIn` in the orders repository) is handed; the race between writers is settled by that write.

## Key elements
- **`OrderActor`**: `'customer' | 'admin' | 'system' | 'withdrawal'`. `system` is narrower than `admin` (moves nobody makes by hand). `withdrawal` is the consumer's right of withdrawal, wider than a customer cancel because it also reaches `processing`.
- **`OrderEvent`**: an edge shape with `from` (also the conditional write's `from` set), `to`, and `actors`.
- **`ORDER_EVENTS`**: the table of named events:
  - `system`-only: `pay` (pending→paid), `process` (paid→processing), `ship` (processing→shipped), `reopen` (shipped→processing), `reship` (delivered→processing), `deliver` (shipped→delivered), `fulfillmentComplete` (processing→delivered), `expire` (pending→canceled).
  - `cancel` (pending/paid→canceled): customer, admin, withdrawal.
  - `cancelInFulfillment` (processing→canceled): admin, withdrawal.
- **`UNDELIVERABLE_EVENT`**: the `processing→canceled` edge for a lost parcel nobody reshipped. It has no actors and is deliberately kept out of `ORDER_EVENTS`.
- **`OrderEventName`**: the key type of `ORDER_EVENTS`.
- **`canTransition(from, to, actor)`**: whether a declared edge allows that actor. It delegates to a `defineLifecycle` instance, and staying in the same status is never a transition.
- **Status predicates**:
  - `isPayable`: true when `system` may move the status to `paid` (so `pending` only).
  - `canProcessOrder`: checks the `process` event's `from` (`paid`).
  - `isAwaitingGoods`: reads `ORDER_STATUS_TRAITS` (`stockCommitted && beforeDispatch`, so `paid`/`processing`).
  - `canShip`: checks the `ship` event's `from` (`processing`).
  - `canRecordArrival`: true for `processing` or `shipped`.
  - `hasShopStarted`: not payable and not processable, so it includes `canceled`.
  - `paymentSettled`: reads `stockCommitted` from the traits.
- **`canOverrideTo(from, to, digitalOnly?)`**: a separate forward-only rule for admin overrides. It follows the sequence `paid → processing → shipped → delivered` and only lands on `processing`, `shipped` or `delivered`. With `digitalOnly`, `shipped` is never a target.
- A helper that lists the statuses an override from `from` could land on follows `canOverrideTo`. The visible content cuts off before it.

## Relationships
- **`@domain-primitives/lifecycle`** (`src/domain-primitives/lifecycle.ts`): supplies `defineLifecycle`, which validates the table at load and produces the edge queries.
- **`./status-traits`** (`src/modules/orders/domain/status-traits.ts`): `ORDER_STATUS_TRAITS` backs `isAwaitingGoods` and `paymentSettled`.
- **`@types`**: provides `OrderStatus` and `OrderActions`.
- **Consumers** (graph neighbors that depend on this file, not shown in its content): the delivery services (`actions`, `deliver`, `ensure`, `holds`, `lost`, `process`, `progress`, `ship-gate`) and the order services (`actions`, `cancel`, `fulfillment`), plus `src/modules/orders/domain/fulfillment.ts` and `src/modules/orders/domain/index.ts`. The file's own comments confirm these links:
  - `markProcessing` and `markUndeliverable` use the `process` and undeliverable `from` sets.
  - `cancel()` reads `statusesLeadingTo(canceled, 'system')`.
  - `payments` is the only caller of `pay`.
  - `delivery` records the `ship`, `deliver` and start events.

## Notes
- Each event keeps its `from`, `to` and actors on one entry, so a service names the event and never guesses a `from`.
- `UNDELIVERABLE_EVENT` is deliberately outside `ORDER_EVENTS`. Giving that edge a `system` actor would make `statusesLeadingTo(canceled, 'system')` include `processing`, and the system cancels would then match orders in fulfillment.
- `expire` is separate from `cancel` so the reservation sweep never cancels an order that landed a payment in the same race.
- `reopen` and `reship` are the only backward moves, and both are `system`-only. `canOverrideTo` is forward-only, and is deliberately not built on `canTransition`, because an override exists to skip the `from` gate the normal lifecycle enforces.
- `canProcessOrder` and `canShip` read the event's `from` directly instead of calling `canTransition`, so a pre-check and the conditional write cannot disagree.
- An admin override never lands on `paid` or `canceled`. Cancel has its own endpoint, and leaving `pending` goes only through the offline-payment door.
