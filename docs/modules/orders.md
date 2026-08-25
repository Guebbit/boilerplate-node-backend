# orders

::: tip At a glance
**Owns** — placed orders: the line items frozen at purchase time, the status machine, and what cancelling restores.
**Depends on** — [`inventory`](./inventory.md) for the units, [`products`](./products.md) for the shape it embeds.
**Breaks if you change** — the `status` enum. Three other modules react to transitions in it.
:::

## The story

This is the module with the real invariants: what an order totals, which status transitions are
legal, and what cancelling gives back. If any module here ever grows a proper aggregate, it is
this one.

**An order embeds the catalogue row rather than referencing it.** `items` carries `productSchema`
itself, so a later edit to a product cannot rewrite the history of an order placed last March.
That is the whole reason [`products`](./products.md) publishes its schema and its serialisation
transform through its barrel — the alternative is an invoice that changes after it was paid.

The status enum is the module's public vocabulary:

| Status                                 | What it means                                | Who moves it                            |
| -------------------------------------- | -------------------------------------------- | --------------------------------------- |
| `pending`                              | created, unpaid, units held                  | checkout or an admin                    |
| `paid`                                 | money taken, units committed                 | [`payments`](./payments.md) on confirm  |
| `processing` · `shipped` · `delivered` | fulfilment                                   | admin, then [`delivery`](./delivery.md) |
| `cancelled`                            | units released, refund issued if one was due | admin, or an expired hold               |

::: warning Two modules reach back, and both do it through events
[`inventory`](./inventory.md) cancels an order when its hold times out (`reservation.expired`), and
this module announces `order.cancelled` so [`payments`](./payments.md) can refund. Neither is an
import, which is what keeps a mutually-aware pair acyclic.
:::

Each account reads back only its own orders; writing and soft-deleting is admin-only. The
`userId: 1, deletedAt: 1` index is what makes both of those cheap at once.

## Related pages

- [Modules overview](./index.md) — the whole context map
- [`inventory`](./inventory.md) — where the units actually move
- [`payments`](./payments.md) — the money half of the same transition
- [Tactical DDD](../theory/tactical-ddd.md) — why this is the aggregate candidate
- [Events & Logging](../tools/events-and-logging.md) — `order.cancelled` and `reservation.expired`
