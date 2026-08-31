# wishlist

::: tip At a glance
**Owns** — one wishlist per user, holding product references and nothing else.
**Depends on** — [`products`](./products.md), [`users`](./users.md), [`cart`](./cart.md).
**Breaks if you change** — nothing outside this folder. No module depends on it.
:::

## Its neighbourhood

<!-- module-graph:wishlist:start -->

_Solid arrows are imports. Dotted arrows are domain events — the return path an import
graph cannot see._

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 30, 'rankSpacing': 60}}}%%
flowchart LR
    wishlist["wishlist<br/><i>this module</i>"]
    cart["cart"]
    products["products"]
    users["users"]

    wishlist --> cart
    wishlist --> products
    wishlist --> users
    products -. "product.deleted" .-> wishlist
    users -. "user.deleted" .-> wishlist

    classDef core fill:#dbeafe,stroke:#2563eb,color:#111827;
    classDef supporting fill:#fef3c7,stroke:#d97706,color:#111827;
    classDef generic fill:#dcfce7,stroke:#16a34a,color:#111827;
    classDef centre fill:#ede9fe,stroke:#7c3aed,stroke-width:2px,color:#111827;
    class cart,products core;
    class users generic;
    class wishlist centre;
```

<!-- module-graph:wishlist:end -->

## The story

The smallest domain in the repo, and a useful one to read first: it has the same shape as
[`cart`](./cart.md) — one document per user, product references, a unique index on `userId` — with
none of checkout's complexity.

Its three arrows are the same one-way arrows the cart declares, for the same reasons. A saved line
is meaningless without the product it points at; the list belongs to an account; and the
move-to-cart exit writes a cart line, which is a `customer-supplier` demand on the cart's store.

::: tip It is depended on by nothing
Which makes it the cheapest module in the repo to delete — `rm -rf` plus one line in
`src/modules.ts`, and nothing else notices. If you want to see the deletability claim hold, try it
here first.
:::

Products and users reach back the same way they reach the cart: a deleted product must leave every
wishlist, and a destroyed account must take its wishlist with it. Both arrive as domain events, so
the import graph stays acyclic even though the domains are mutually aware.

## The pipeline

The whole module. Three arrows out, two events in — and nothing at all pointing back at it.

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 30, 'rankSpacing': 55}}}%%
flowchart LR
    A["save a product"] --> W["wishlist<br/><i>one document per user</i>"]
    W -->|"move-to-cart"| C["cart line<br/><i>qty 1, or incremented</i>"]
    C --> X["and it leaves the wishlist"]
    P["products"] -. "product.deleted" .-> W
    U["users"] -. "user.deleted" .-> W

    classDef own fill:#ede9fe,stroke:#7c3aed,color:#111827;
    classDef peer fill:#dbeafe,stroke:#2563eb,color:#111827;
    class A,W,X own;
    class C,P,U peer;
```

## Related pages

- [`cart`](./cart.md) — the same shape, with the hard part attached
- [Adding & Removing a Module](../theory/module-lifecycle.md) — the deletability procedure
- [Events & Logging](../tools/events-and-logging.md) — the two events this module listens for
- [Product Analytics](../tools/analytics.md) — the save/move funnel
