# products

::: tip At a glance
**Owns** — the catalogue: what the shop sells, and the two stock counters that sit on every product row.
**Depends on** — nothing. It is the leaf four other domains conform to.
**Breaks if you change** — `productSchema`. `orders` embeds it, so an order's history is literally this shape.
:::

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

## Related pages

- [Modules overview](./index.md) — the whole context map
- [MongoDB & Mongoose](../tools/mongodb-mongoose.md) — what a repository and a model are
- [Strategic DDD](../theory/strategic-ddd.md) — why `conformist` is the label on four of the arrows pointing here
- [Events & Logging](../tools/events-and-logging.md) — the bus `product.deleted` travels on
- [Contract Ownership & Fragmentation](../api/contract-fragmentation.md) — how this module's `openapi.yaml` reaches the root document
