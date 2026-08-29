# docs/modules/cart.md

## Purpose

Documents the cart module: a per-user collection (one document per `userId`) that holds priced line items against the live catalogue and terminates in a checkout. It is the single point where price, stock, address, shipping, and order creation must all agree atomically.

## Key elements

- **Cart collection** — one document per user, enforced by a `unique: true` index on `userId`; all mutations are single upserts.
- **`clearLinesIfUnchanged`** — conditionally empties the cart at checkout, guarded by the version read at line-creation time. Removing this guard lets two parallel checkouts produce two orders from one cart.
- **`items.productId: 1` index** — supports the single query "find every cart holding a deleted product" without a collection scan.
- **`CartItem` shape** — stored lines use `{ productId, quantity }`, identical to the wire contract; no mapper exists between them.
- **Storage: Mongo (not Redis)** — deliberate. Redis is cache-only (`allkeys-lru`); a cart in Redis would trade durability and an indexed query for no concurrency benefit.

## Relationships

- **cart-checkout** — the step-by-step flow that ends a cart and produces an order.
- **orders** — the output of a successful checkout.
- **inventory** — holds stock units for the duration of a checkout.
- **products** — provides live pricing at read time; the `items.productId` index lets a product deletion find affected carts.
- **users** — the cart is a separate collection keyed by `userId`; user responses cannot leak a cart the user does not carry.
- **delivery** — one of the six contexts whose rules must agree at the checkout instant (address, shipping cost).

## Notes

- The six outgoing edges are structural, not a refactoring smell — they reflect the domains that must be consistent in one transaction.
- "One cart per user" is a database invariant (unique index), not a convention each write path must remember.
- The version-conditional clear is the concurrency safeguard; treat it as load-bearing.
