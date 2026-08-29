# docs/modules/inventory.md

## Purpose

Sole owner and writer of the two stock counters (`onHand`, `reserved`) that physically live on the product document, plus the `stockmovements` ledger. Every inventory mutation in the system routes through this module's four transitions; no other code writes those counters.

## Key elements

- **`reserveForOrder`** — holds units for a checkout or admin-created order; increments `reserved`, decrements `onHand`.
- **`commitForOrder`** — finalises a sale once payment is confirmed; decrements `reserved` (units leave).
- **`releaseForOrder`** — returns held units; fired by two distinct callers: order cancellation and the timeout sweep.
- **Conditional status claim** — each transition atomically claims the reservation's status so that racing cancels/sweeps or duplicate webhooks resolve to exactly one winner. This is the module's core correctness mechanism (no external lock).
- **`stockmovements` write** — a ledger row is written in the *same call* that moves the counter, making the audit trail inseparable from the mutation.

## Relationships

- **`products.md`** — the counters this module writes live on the product document; `products` reads them for catalogue display but never writes them.
- **`cart-checkout.md`** — checkout (and admin order creation) is the caller that fires `reserveForOrder`.
- **`payments.md`** — a confirmed payment event is the caller that fires `commitForOrder`.
- **`orders.md`** — the order is what a reservation is attached to; order cancellation fires `releaseForOrder`.
- **`inventory-reservations.md`** — documents the reservation lifecycle and the sweep in detail; the sweep is the second caller of `releaseForOrder`.

## Notes

- **No separate "stock moved" event exists.** An earlier version emitted `product.stock_moved`, but callers forgot to fire it on rollback paths, corrupting the audit trail. The fix was to make the ledger write part of the transition itself, not a side-effect.
- **Exactly-once is structural, not advisory.** The conditional claim on the reservation status is the only guard; there is no distributed lock or retry queue behind it. Any change to the claim condition risks double-application.
- **Deleting this module means the shop cannot sell.** It is not an optional enrichment layer.
