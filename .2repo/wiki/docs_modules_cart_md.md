# docs/modules/cart.md

## Purpose

Owns one cart document per user (keyed by `userId`), prices its lines against the live catalogue, and executes the checkout pipeline that ends the cart. It is the convergence point where price, stock, address, shipping, and order creation must all agree in a single transactional sequence.

## Key elements

- **Cart collection** — standalone Mongo collection, one document per user (`userId` is `unique: true`). Not a subdocument of the user.
- **`clearLinesIfUnchanged`** — conditional clear that empties the cart only if the line version matches what checkout read. This is the concurrency guard that prevents two parallel checkouts from producing two orders.
- **Index `items.productId: 1`** — exists solely so a `product.deleted` event can find every cart still holding that line without a collection scan.
- **Line shape `{ productId, quantity }`** — matches the API contract's `CartItem` exactly; no mapper between stored and wire representation.
- **Checkout pipeline** (in order): price lines (products) → resolve address (account) → price shipping (delivery) → reserve units (inventory) → create order (orders) → `clearLinesIfUnchanged`.
- **Domain events consumed** — `product.deleted` and `user.deleted` trigger reactive cleanup.

## Relationships

- **cart-checkout** (`docs/modules/cart-checkout.md`) — step-by-step checkout flow, the retract path, and the 409 race-loss handling.
- **inventory** (`docs/modules/inventory.md`) — cart reserves units; a shortfall on any line aborts the whole checkout atomically.
- **orders** (`docs/modules/orders.md`) — checkout's terminal write: one cart becomes one order.
- **delivery** (`docs/modules/delivery.md`) — cart resolves the shipping address and prices the delivery.
- **account-sessions** (`docs/modules/account-sessions.md`) — cart resolves the user's billing/shipping address through the account module.
- **wishlist** (`docs/modules/wishlist.md`) — wishlist can push items into the cart (solid arrow in the module graph).
- **endpoints** (`docs/api/endpoints.md`) — `POST /cart/checkout` is the public entry point.
- **redis-cache** (`docs/tools/redis-cache.md`) — documents why the cart is deliberately *not* cached in Redis (durability + indexed-query cost).
- **strategic-ddd** (`docs/theory/strategic-ddd.md`) — frames the cart's six outgoing edges as a legitimate convergence context, not a design smell.
- **index** (`docs/modules/index.md`) — lists cart among the shop's modules.
- **ops** (`docs/reference/ops.md`) — operational context for the Mongo collection it owns.
- **shopper** (`docs/demo-ecommerce/shopper.md`) — demo scenario that exercises the cart and checkout flow.

## Notes

- **Do not remove the `clearLinesIfUnchanged` condition.** It is the only thing preventing a lost-update race from duplicating an order. The `unique: true` on `userId` makes every cart mutation a single upsert; checkout then empties conditionally on the version it read.
- **Cart is Mongo, not Redis.** Redis in this system is cache-only (`allkeys-lru`, no persistence). Putting the cart there would sacrifice durability for no concurrency benefit and turn one indexed query into a hand-maintained secondary structure.
- **One cart per user is enforced by the database**, not by application logic. Every write path relies on this to be a simple upsert.
- **The six outgoing dependencies are intentional.** The cart is a *customer* of four bounded contexts (products, account, delivery, inventory, orders, users), not an orchestration layer above them. Refactoring them away removes the checkout's semantic meaning.
