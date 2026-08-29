# docs/modules/inventory-reservations.md

## Purpose

Documents the reservation subsystem inside the inventory module: the four state transitions that move `onHand`/`reserved` counters, the conditional-claim mechanism that guarantees exactly-once semantics without locks or transactions, and the admin sweep that expires stale holds. Exists so readers understand the sole writer path for inventory counters and the invariants that make it safe under concurrency.

## Key elements

- **`reserveForOrder`** — takes a hold (`reserved +n`); called at checkout and on admin order creation.
- **`commitForOrder`** — converts a hold into a sale (`onHand −n`, `reserved −n`); called by payments on confirmation.
- **`releaseForOrder`** — frees a hold (`reserved −n`); called on order cancel or by the sweep on expiry.
- **`POST /inventory/reservations/sweep`** — admin route that releases every hold past its `expiresAt`; idempotent and cheap.
- **Conditional status claim** — each transition succeeds only if the row is still in the expected state; the loser of a race is a no-op. No distributed lock or transaction.
- **`stockmovements` ledger** — written by the same call that moves the counter (deltas, not totals); no `product.stock_moved` event exists.
- **`NODE_RESERVATION_TTL_MINUTES`** (default 30) — stamped onto each hold at reserve time; read per call.
- **`NODE_LOW_STOCK_THRESHOLD`** (default 5) — read per call; two readers intentionally count different populations (full catalogue vs. publicly visible only).
- **`status: 1, expiresAt: 1` index** — exists solely to serve the sweep query.
- **`inventory.reservation_expired`** — event published when a hold is swept; consumed by the orders module.

## Relationships

- **cart-checkout** — calls `reserveForOrder` to place a hold before payment.
- **payments** — calls `commitForOrder` once payment is confirmed, converting the hold into a completed sale.
- **orders** — calls `releaseForOrder` on cancellation; subscribes to `inventory.reservation_expired` to auto-cancel the order (event-based to keep the dependency acyclic).
- **inventory** — parent module; reservations are the only writers of `onHand`/`reserved`, but `receive` and `adjust` reasons (receipts/adjustments) also move `onHand` outside the reservation flow.

## Notes

- The conditional claim is the *entire* correctness guarantee. Changing it (e.g., adding a lock, making the claim unconditional) breaks exactly-once semantics.
- Ledger rows and counter changes are one atomic operation, not an event reaction. There is deliberately no `product.stock_moved` event; reintroducing one re-couples them.
- The sweep is an admin HTTP route, not a background timer. An operator can force it; it is safe to call repeatedly.
- `receive` and `adjust` ledger reasons move `onHand` directly and belong to no reservation; they are not part of the four-transition lifecycle.
- The two low-stock gauges will report different numbers by design — they filter different product populations. This is not a bug.
- All env-var settings are read per request, not captured at module load, so changing a variable takes effect on the next call.
