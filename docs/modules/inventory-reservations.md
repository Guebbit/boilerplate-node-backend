# Reservations

A reservation is a **promise that units exist**, made before money changes hands and kept for a
fixed window.

::: tip At a glance
**Window** — `NODE_RESERVATION_TTL_MINUTES`, 15 by default, stamped onto each hold at reserve time.
**Guarantee** — every transition is exactly-once, by conditional claim rather than by lock.
**Breaks if you change** — the conditional status claim. It is the entire correctness of this module.
:::

## Two counters, six transitions

Every product row carries `onHand` and `reserved` (and the stock level a third, `backordered`, for
[preorders](#preorders)). [`products`](./products.md) never writes either,
and neither does anything else — the six transitions below are the only writers in the
application.

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 34, 'rankSpacing': 60}}}%%
flowchart LR
    N["no hold"] -->|"reserveForOrder<br/><i>checkout · admin create</i>"| H["held<br/><i>reserved +n</i>"]
    H -->|"commitForOrder<br/><i>payment confirmed</i>"| C["committed<br/><i>no counter moves</i>"]
    H -->|"releaseForOrder<br/><i>order cancelled</i>"| R["released<br/><i>reserved −n</i>"]
    H -->|"releaseForOrder<br/><i>the sweep</i>"| R
    C -->|"releaseCommittedForOrder<br/><i>a PAID order cancelled before dispatch</i>"| R
    C -->|"shipForOrder<br/><i>the parcel leaves</i>"| S["shipped<br/><i>onHand −n · reserved −n</i>"]

    classDef open fill:#fef3c7,stroke:#d97706,color:#111827;
    classDef done fill:#ccfbf1,stroke:#0f766e,color:#111827;
    classDef none fill:#f1f5f9,stroke:#94a3b8,color:#111827;
    class H open;
    class C,R,S done;
    class N none;
```

`held` is the only state with a deadline: `expiresAt` is what makes it non-permanent. `committed` is
a paid order waiting for its parcel; it ends at `shipped` (the units leave) or, if the order is
cancelled first, `released`. Shelf count (`onHand`) drops at dispatch, not at payment — the model
Shopify, Magento MSI, Saleor and Medusa share — so a stocktake counts the same number `onHand`
says, and `available` is identical in both models at every moment.

| Transition                 | Called by                                                                                            | Counters                        | Ledger `reason` |
| -------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------- | --------------- |
| `reserveForOrder`          | [checkout](./cart-checkout.md), admin order create                                                   | `reserved` +n                   | `reserve`       |
| `commitForOrder`           | [`payments`](./payments.md) on confirm                                                               | none                            | none            |
| `shipLinesForOrder`        | [`delivery`](./delivery.md) (through `orders`), in the transaction of each shipment — only ITS units | `onHand` −n, `reserved` −n      | `ship`          |
| `shipForOrder`             | [`orders`](./orders.md), in the transaction of an admin override past dispatch — whatever is left    | `onHand` −n, `reserved` −n      | `ship`          |
| `releaseLinesForOrder`     | [`returns`](./returns.md), in the transaction of a remainder cancel — only the cancelled units       | `reserved` −n                   | `release`       |
| `releaseForOrder`          | [`orders`](./orders.md) on cancel                                                                    | `reserved` −n                   | `release`       |
| `releaseForOrder`          | the sweep                                                                                            | `reserved` −n                   | `expire`        |
| `releaseCommittedForOrder` | [`orders`](./orders.md) on cancel, once the release above claims nothing (a paid, unshipped order)   | `reserved` −n                   | `release`       |
| `reserveForOrder`          | checkout, for a [preorder](#preorders) line                                                          | `backordered` +n                | `preorder`      |
| `receive`                  | `POST /inventory/receipts`, for the paid preorders waiting                                           | `backordered` −n, `reserved` +n | `allocate`      |

**`releaseCommittedForOrder` is never merged into `releaseForOrder`**, on purpose: the sweep only
ever releases a stale HOLD, and folding the paid case into that same function would let it put a
just-paid order's units back on sale the moment its unrelated reservation record aged past the
sweep's cutoff — a sale undone by a timer, not by anyone cancelling anything. A cancel calls it
explicitly, only after `releaseForOrder`'s own claim on `held → released` has already missed —
exactly what a PAID order's `committed` hold does, every time.

An order ships in parts, so the shelf follows the shipments, not the status. `shipLinesForOrder` takes
ONE shipment's lines off the shelf in that shipment's own transaction: `onHand` and `reserved` both
drop by what left, `available` does not change, and the hold keeps the units that have not left yet —
it ends `shipped` with the last one. The arithmetic is a pure rule (`takeFromHold`): a line asking for
more than the hold holds of that product takes what there is, so the counters move by exactly what was
set aside. `releaseLinesForOrder` is its twin for a cancelled remainder, and ends the hold `released`.
Because the shelf count follows what really left, a later return's `restock` puts back units that
were taken out.

`shipForOrder` is what remains of the whole-hold dispatch, and the admin override into
`shipped`/`delivered` is its one caller: it ships whatever the hold still sets aside, in the status
write's own transaction. It claims `committed → shipped`, and also `held → shipped` for a payment whose
own commit crashed and has not been retried yet: the goods left either way, and the retry then finds
a shipped hold and stays silent. Goods a customer sends back are a separate door: `restockReturnedLines` writes `restock`
rows and claims nothing, because the hold is `shipped` for good.

Both take an optional Mongo `session`. `orders`' cancel passes one so the status move, the release
commits together or not at all; given a session, the catalogue's stock cache is
not synced inside the transaction (that write cannot roll back), and the caller runs
`refreshStockCacheForOrder` after the commit (which never rejects: a failed read there only leaves the catalogue copy stale until the next stock change).

Two more `reason` values exist and belong to no reservation at all: `receive`
(`POST /inventory/receipts`) and `adjust` (`POST /inventory/adjustments`), which move `onHand`
directly.

## Preorders

A preorder is sold before its units exist, so it claims an **allowance** instead of a shelf unit. The
stock level gains two counters, a third ledger column and two `reason` values; the hold's lines gain
a `kind` (`stock` or `preorder`).

| Counter / column   | Meaning                                                                                       |
| ------------------ | --------------------------------------------------------------------------------------------- |
| `backorderLimit`   | how many units may be backordered at once; set by an admin, `0` closes preordering            |
| `backordered`      | units claimed against it and not yet allocated stock, paid or not                             |
| `backorderedDelta` | the ledger column that makes `backordered` replayable, like `onHandDelta` and `reservedDelta` |

A claim is a `preorder` movement (`backordered` +n, nothing else), guarded in the write's own filter by
`backordered + n <= backorderLimit`. The shelf is never read: 50 units on hand do not widen the
allowance, and an allowance of 5 does not need one unit to exist. The cap counts from the moment the
order is placed (decided 2026-10-11): a buyer who then pays a week later by bank transfer is never
refused for a cap that filled in between.

```mermaid
flowchart LR
    N["no hold"] -->|"reserveForOrder<br/><i>preorder line</i>"| H["held<br/><i>backordered +n</i>"]
    H -->|"commitForOrder<br/><i>stamps committedAt</i>"| C["committed<br/><i>no counter moves</i>"]
    H -->|"sweep / cancel"| R["released<br/><i>backordered −n</i>"]
    C -->|"cancel before stock"| R
    C -->|"receive: allocate<br/><i>oldest committedAt first</i>"| A["committed, kind stock<br/><i>backordered −n · reserved +n</i>"]
    A -->|"shipLinesForOrder"| S["shipped<br/><i>onHand −n · reserved −n</i>"]
```

| Moment                  | What happens to a preorder line                                                                             |
| ----------------------- | ----------------------------------------------------------------------------------------------------------- |
| before payment          | today's windows: 15 minutes by card, a week by bank transfer, then the sweep gives the allowance back       |
| payment                 | `held → committed`, no expiry; `committedAt` is stamped by the same claim, so it is the payment's instant   |
| stock arrives           | `POST /inventory/receipts` receives and **allocates in the same transaction**, oldest `committedAt` first   |
| a short delivery        | the order gets what exists; the rest stays a claim and keeps waiting                                        |
| cancelled while waiting | the allowance comes back (`backordered` −n); `restock` is never used, it would add stock that never existed |

Allocation turns the claim into an ordinary hold on a real unit: `backordered` falls and `reserved`
rises by the same number, so `available` drops by what was allocated and the units never look
sellable to a stranger in between. From then on those units ship, release and restock like any
others; the hold keeps the same product under both kinds while part of it still waits, and every
caller that takes lines out of a hold (`shipLinesForOrder`, `releaseLinesForOrder`) names the kind.
A preorder claim cannot ship: `ship` of a `preorder` line throws and rolls its transaction back.

Oldest payment first, not oldest order: the key is the moment the buyer's money was in, so a bank
transfer is still served, after the cards that paid earlier. It is the hold's own `committedAt`
because this module does not depend on `orders` and cannot read `paidAt`. Unpaid holds are never
allocated. Stock that arrived while an order was still unpaid is served by the payment itself:
`commitForOrder` runs the same allocation once it has claimed the hold.

Each allocation writes `inventory.backorder_allocated { orderId, productId, waiting }` to the outbox in
that transaction. `waiting` is what the order still claims of that product, a state and not a delta, so
a redelivery is harmless: [`delivery`](./delivery.md) releases whatever it holds beyond `waiting`, and
the second time there is nothing beyond it.

A product that is a preorder never reads as "running low": its `lowStock` flag is false and the
`products_low_stock_total` gauge leaves it out (`countPublic` with `excludePreorders`). The stock
board's `lowOnly` view is unchanged, since a restocker wants to see it.

`GET /inventory/preorders` is the preorder board's read: per product the cap, `backordered`, its split
between `held` (unpaid, frees itself) and `paid`, `left`, and `ordered`, the lifetime count read off the
ledger's `preorder` rows. `PUT /inventory/levels/{productId}/backorder-limit` sets the allowance under
`create:StockMovement`; it is not a stock movement and leaves no ledger row, only an audit entry.

## Exactly-once, without a lock

::: warning The claim is the guarantee
Each transition claims the reservation's status **conditionally** — `held → committed` only
succeeds if the row is still `held`. So a cancel racing the sweep, or a provider webhook delivered
twice, resolves to exactly one winner and the loser is a no-op rather than a second counter move.

There is no distributed lock holding this up. A single conditional update decides the winner, which
is why it survives a restart and a second worker. The claim and every line's counter move then land
in **one transaction** (the caller's, or one `commitForOrder` / `releaseForOrder` /
`releaseCommittedForOrder` opens itself): a write that throws partway undoes the claim too, so the retry
finds the hold still open and finishes the job instead of reporting "already done".

Taking a multi-line hold's lines is ordered by product id, so two checkouts listing the same
products oppositely meet on the same product first, and one goes on rather than both refusing.
:::

## A paid order with no hold is an incident, not a no-op

A paid order always commits its hold, and a shipped one always ships it. When `commitForOrder`'s or
`shipForOrder`'s claim misses, that is one of two very different facts, and it tells them apart
before deciding what to do:

- the hold is already `committed` or `shipped` — a redelivered settlement, or a repeated dispatch
  report; the sale already stands. Silent, correctly: replaying it is not new information.
- the hold is `released`/`expired`, or never existed — the order is paid and nothing was set aside
  for it. Alarmed: an `admin.commit.orphaned` audit row, `outcome: 'failure'`, naming the order and the `stage`
  (`commit` or `ship`).

The alarm only **records** the fact; nothing auto-compensates. A missing hold does not mean
missing goods — the units are still on the shelf, just unreserved — so refunding on that signal
alone would cancel a sale that may be perfectly fulfillable. A human reads the audit trail and
decides.

## The ledger is half of the transition, not a reaction to it

`stockmovements` rows are written **by the same call that moves the counter**. There is deliberately
no `product.stock_moved` event:

> As an event, the ledger row would be a _reaction_ to a counter change rather than half of one, so
> every mover would have to remember to announce on every path, rollback paths included.
> **A counter change nobody recorded is a corrupt audit trail, not a smaller feature.**

The row records the deltas rather than the resulting totals, so replaying the ledger reconstructs
either counter at any point in time.

## The sweep

`POST /inventory/reservations/sweep` releases every hold past its `expiresAt`; `npm run
sweep:reservations` is the same work, driven every 5 minutes rather than on demand — see
[Scheduled jobs](../reference/ops.md#scheduled-jobs). The admin route stays, deliberately: the
operation is idempotent and cheap, and occasionally something an operator wants to force between
ticks.

The sweep DRAINS: it reads batches of 200 stale holds until one comes back short (at most 50
batches, 10,000 holds, per run), so a backlog is gone in one tick instead of leaking out at 40 a
minute. The scheduled run holds a lease (`sweep:reservations`), since a drain can outlast the
five-minute tick and two drains would only fight over the same claims.

The `status: 1, expiresAt: 1` index exists for exactly that query, and for nothing else.

Only an operator's on-demand run through the route is audited (`admin.reservations.swept`); the scheduled
run writes no audit row, since it has no caller.

When a hold is swept, `inventory.reservation_expired` is published through the transactional
outbox, in the same transaction as the release, so the units come back and the announcement exists
together or not at all; the relay retries until [`orders`](./orders.md) has heard it, and `orders`
cancels the order. Until it does, a card confirm on that order is refused: its hold is released, so
taking money would sell stock that may be gone. That is the one arrow pointing back
from this module, and it is an event rather than an import precisely so the two mutually-aware
domains stay acyclic.

**The hold length is per-checkout, not a single constant.** `reserveForOrder` takes an optional
window and falls back to `NODE_RESERVATION_TTL_MINUTES` only when the caller gives none — `cart`'s
checkout hands it a longer one for a `bank_transfer` order (`NODE_BANK_TRANSFER_HOLD_HOURS`, a
week by default). The sweep itself needed no change to honour this: it only ever reads each hold's
own stored `expiresAt`, never a constant. See [Payments — Bank transfer](./payments.md#bank-transfer).

**A card payment gone `processing` gets the same week, after the fact.** `extendHoldForOrder`
pushes a still-`held` hold's `expiresAt` out to `NODE_BANK_TRANSFER_HOLD_HOURS` from now, called by
`settlePayment` the moment the provider reports `processing` — a SEPA debit, some bank redirects,
can take days to settle, and the ordinary 15-minute window would let the sweep cancel an order
whose money is still genuinely on its way. `requires_action` gets no such grace: that state means
the BROWSER has a challenge to answer, not the provider a payment to finish, so the ordinary window
already fits it. No setting of its own — reusing the bank-transfer window is the whole point: both
are "this payment method settles over days", the same fact under two names. Guarded on
`status: 'held'`, the same as every other lifecycle write here, so a hold already claimed has
nothing left on it to extend.

## The threshold, and its two readers

`NODE_LOW_STOCK_THRESHOLD` (5 by default, declared once as the infrastructure's `stockConfig` slice) has two readers that deliberately count **different
populations**:

| Reader                             | Population                     | Why                                                          |
| ---------------------------------- | ------------------------------ | ------------------------------------------------------------ |
| The stock board's `lowOnly` filter | the whole catalogue            | an admin restocking needs to see an inactive product's units |
| `products_low_stock_total`         | publicly visible products only | an alert about stock a customer cannot buy is noise          |

The two numbers will not match, and should not. Sharing the threshold while differing on the
population is the intended arrangement.

Both settings are read through their slice on every call rather than captured at import, and the
slice parses the environment once per process: a changed variable takes effect on restart.

## Related pages

- [`inventory`](./inventory.md) — the module this belongs to
- [Checkout](./cart-checkout.md) — where a hold is taken
- [`payments`](./payments.md) — where a hold becomes a sale
- [`orders`](./orders.md) — the listener for `inventory.reservation_expired`
- [Prometheus](../tools/prometheus.md) — the two gauges this module exports
