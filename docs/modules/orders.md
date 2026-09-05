# orders

::: tip At a glance
**Owns** — placed orders: the line items frozen at purchase time, the status machine, and what cancelling restores.
**Depends on** — [`inventory`](./inventory.md) for the units, [`products`](./products.md) for the shape it embeds.
**Breaks if you change** — the `status` enum. Three other modules react to transitions in it.
:::

## Its neighbourhood

<!-- module-graph:orders:start -->

_Solid arrows are imports. Dotted arrows are domain events — the return path an import
graph cannot see._

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 30, 'rankSpacing': 60}}}%%
flowchart LR
    orders["orders<br/><i>this module</i>"]
    account["account"]
    cart["cart"]
    delivery["delivery"]
    inventory["inventory"]
    payments["payments"]
    products["products"]
    users["users"]

    account --> orders
    cart --> orders
    delivery --> orders
    payments --> orders
    orders --> inventory
    orders --> products
    orders --> users
    inventory -. "inventory.reservation_expired" .-> orders
    users -. "user.deleted" .-> orders
    orders -. "order.status_changed" .-> delivery
    orders -. "order.cancelled" .-> payments

    classDef core fill:#dbeafe,stroke:#2563eb,color:#111827;
    classDef supporting fill:#fef3c7,stroke:#d97706,color:#111827;
    classDef generic fill:#dcfce7,stroke:#16a34a,color:#111827;
    classDef centre fill:#ede9fe,stroke:#7c3aed,stroke-width:2px,color:#111827;
    class cart,products core;
    class delivery,inventory,payments supporting;
    class account,users generic;
    class orders centre;
```

<!-- module-graph:orders:end -->

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

## The pipeline

The status enum above, drawn. Every solid edge is someone deciding; the dotted ones are this
module announcing and a sibling reacting.

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 30, 'rankSpacing': 55}}}%%
flowchart LR
    P["pending<br/><i>created · units held</i>"] -->|"payments confirms"| PA["paid<br/><i>units committed</i>"]
    PA -->|admin| PR["processing"]
    PR -->|admin| SH["shipped"]
    SH -->|"delivery advances"| DE["delivered"]
    P -.->|"admin · or an expired hold"| CA["cancelled<br/><i>units released</i>"]
    PA -.->|"admin · refund due"| CA
    SH -. "order.status_changed" .-> DL["delivery<br/><i>creates the parcel</i>"]
    CA -. "order.cancelled" .-> PM["payments<br/><i>refunds if one was due</i>"]

    classDef open fill:#fef3c7,stroke:#d97706,color:#111827;
    classDef done fill:#ccfbf1,stroke:#0f766e,color:#111827;
    classDef bad fill:#fee2e2,stroke:#b91c1c,color:#111827;
    classDef peer fill:#dbeafe,stroke:#2563eb,color:#111827;
    class P,PR,SH open;
    class PA,DE done;
    class CA bad;
    class DL,PM peer;
```

## Related pages

- [Modules overview](./index.md) — the whole context map
- [`inventory`](./inventory.md) — where the units actually move
- [`payments`](./payments.md) — the money half of the same transition
- [Tactical DDD](../theory/tactical-ddd.md) — why this is the aggregate candidate
- [Events & Logging](../tools/events-and-logging.md) — `order.cancelled` and `reservation.expired`
