# docs/modules/inventory.md

## Purpose

Single writer for all stock-counter changes (`onHand`, `reserved`) and the `stockmovements` audit ledger. It owns the reservation lifecycle (hold → commit/release) and guarantees exactly-once transitions via conditional claims on reservation status. No other module touches the counters.

## Key elements

- **`reserveForOrder`** — holds units (increments `reserved`). Fired by checkout and admin order creation.
- **`commitForOrder`** — converts a hold into a sale (decrements both `onHand` and `reserved`). Fired on payment confirmation.
- **`releaseForOrder`** — returns held units to the shelf (decrements `reserved`). Fired on order cancellation or when the sweep expires a timed-out hold.
- **Admin stock moves** — receipt (supplier delivery, `onHand+`) and stocktake adjustment (`onHand ±`). Both write a `stockmovements` row in the same call.
- **Conditional claim (exactly-once)** — each transition atomically claims the reservation's status; a racing cancel/sweep or duplicate webhook resolves to one winner. No external lock is involved.
- **`stockmovements` ledger** — written in the same call that moves a counter; no separate `product.stock_moved` event exists.
- **Sweep** — a periodic process that expires stale holds and calls `releaseForOrder`, then emits the domain event.

## Relationships

- **`products`** — the counters physically live on the product document; `inventory` imports `products` to perform writes. `products` never writes the counters itself.
- **`cart`** — imports `inventory` to call `reserveForOrder` during checkout.
- **`orders`** — imports `inventory` for reserve/commit/release; receives the `inventory.reservation_expired` domain event (emitted by the sweep) to cancel the associated order.
- **`payments`** — imports `inventory`; a confirmed payment triggers `commitForOrder`.
- **`inventory-reservations`** — documents the reservation lifecycle and sweep in detail.
- **`domain-layer`** — supplies the pure rules behind each transition.
- **`prometheus`** — lists the metrics this module exports about itself.

## Notes

- The ledger row is written in the **same call** as the counter move. There is no event that other modules must listen to in order to record a movement; a counter change without a ledger row is treated as a corrupt audit trail.
- `releaseForOrder` has **two callers** (cancel, sweep) but is the same function; the conditional claim is what prevents double-release.
- Deleting this module removes all ability to sell — there is no fallback writer for the counters.
