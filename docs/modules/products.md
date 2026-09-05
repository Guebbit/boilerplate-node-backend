# products

::: tip At a glance
**Owns** — the catalogue: what the shop sells, and the two stock counters that sit on every product row.
**Depends on** — nothing. It is the leaf four other domains conform to.
**Breaks if you change** — `productSchema`. `orders` embeds it, so an order's history is literally this shape.
:::

## Its neighbourhood

<!-- module-graph:products:start -->

_Solid arrows are imports. Dotted arrows are domain events — the return path an import
graph cannot see._

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 30, 'rankSpacing': 60}}}%%
flowchart LR
    products["products<br/><i>this module</i>"]
    cart["cart"]
    inventory["inventory"]
    orders["orders"]
    wishlist["wishlist"]

    cart --> products
    inventory --> products
    orders --> products
    wishlist --> products
    products -. "product.deleted" .-> cart
    products -. "product.deleted" .-> wishlist

    classDef core fill:#dbeafe,stroke:#2563eb,color:#111827;
    classDef supporting fill:#fef3c7,stroke:#d97706,color:#111827;
    classDef generic fill:#dcfce7,stroke:#16a34a,color:#111827;
    classDef centre fill:#ede9fe,stroke:#7c3aed,stroke-width:2px,color:#111827;
    class cart,orders core;
    class inventory,wishlist supporting;
    class products centre;
```

<!-- module-graph:products:end -->

## The story

The catalogue is the model every other context conforms to rather than translates. A cart line, an
order item, a stock movement — each is a statement about a product, which is why this module is
`core` despite doing nothing more interesting than CRUD.

**It depends on nothing, and staying that way was a deliberate decision.** Products genuinely needs
something back: when a product disappears, every cart and wishlist holding it has to drop the
reference. As an import that would be a cycle. As `product.deleted` it is products announcing and
two modules listening, and the arrow still points one way.

::: warning The one field-ownership split worth remembering
`onHand` and `reserved` live on the product document so a catalogue read needs no join — but
**this module never writes them.** Every change goes through a transition in
[`inventory`](./inventory.md). A write to either counter from anywhere else is a bug, not a
shortcut.
:::

Deletion is soft: `active` and `deletedAt`, with a restore route, because an order that embedded a
product still has to render months later. The `active: 1, deletedAt: 1` index is what makes the
public list cheap while the admin list can still see everything.

## The pipeline

A delete is the interesting path, because it is the one that has to reach back into modules this
one may not import.

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 30, 'rankSpacing': 55}}}%%
flowchart LR
    D["admin deletes<br/><i>soft: active · deletedAt</i>"] --> R["the row stays<br/><i>an order from March still renders</i>"]
    D --> C["Redis cache invalidated"]
    D -. "product.deleted" .-> CA["cart<br/><i>drops the line</i>"]
    D -. "product.deleted" .-> WI["wishlist<br/><i>drops the line</i>"]
    IN["inventory"] -.->|"the only writer, ever"| ST["onHand · reserved<br/><i>fields on this document</i>"]

    classDef own fill:#ede9fe,stroke:#7c3aed,color:#111827;
    classDef peer fill:#dbeafe,stroke:#2563eb,color:#111827;
    classDef note fill:#f1f5f9,stroke:#94a3b8,color:#111827,stroke-dasharray:4 3;
    class D,R,C own;
    class CA,WI,IN peer;
    class ST note;
```

## Related pages

- [Modules overview](./index.md) — the whole context map
- [MongoDB & Mongoose](../tools/mongodb-mongoose.md) — what a repository and a model are
- [Strategic DDD](../theory/strategic-ddd.md) — why `conformist` is the label on four of the arrows pointing here
- [Events & Logging](../tools/events-and-logging.md) — the bus `product.deleted` travels on
- [Contract Ownership & Fragmentation](../api/contract-fragmentation.md) — how this module's `openapi.yaml` reaches the root document
