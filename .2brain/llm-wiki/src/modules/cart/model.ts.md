---
source: src/modules/cart/model.ts
source_sha256: bc1614abfb94d20ae83bbfe74a08fc7cd85aa0d710e158789905ae3abb819b2e
context_sha256: 3e97c968e08219e89909898571adf0e385cb3a7f6e7770c12cdba2c49860c874
generated_at: 2026-11-22T04:33:23.896612+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/cart/model.ts

## Purpose
Defines the Mongoose model for carts: one document per user, stored in Mongo (not Redis, which is cache-only and fails open). Field names match the `CartItem` schema in `openapi.yaml`, so stored and wire shapes are identical. Queries live in `./repository` and business rules in `./services`.

## Key elements
- `CartItem`: interface for a stored line, `{ productId: ObjectId, quantity }`. It has no `ref` into `Product` and no `populate()` is used.
- `CartDocument`: document interface with `userId`, `items`, optional `shippingMethodId` (a plain id string set via `PUT /cart/shipping-method`), timestamps, and an explicitly typed `__v: number`.
- `CartModel`: `Model<CartDocument>` type alias.
- `CART_LINE_HARD_MAX` (999): schema and contract ceiling on line quantity. The shop's lower, configurable ceiling is `cartLineMax()` in `./config`.
- `cartSchema`: the schema. `userId` is `unique` and `required`, `items` defaults to `[]`, and timestamps are enabled. Line subdocuments use `_id: false`, `quantity` is `min: 1` / `max: CART_LINE_HARD_MAX`, and `productId` is required.
- Indexes on `cartSchema`:
  - `{ 'items.productId': 1 }`, unnamed, for finding every cart that holds a product being deleted.
  - TTL index `carts_updatedAt_ttl` on `updatedAt`, expiring after `NODE_CART_RETENTION_DAYS * DAY_SECONDS`.
- `applyCartTransform`: `applySerialization(cartSchema)`, which maps `_id` to `id` and removes `__v`.
- `cartModel`: the registered `'Cart'` model.

## Relationships
- `./config`: `cartConfig().NODE_CART_RETENTION_DAYS` is read once at import time to size the TTL index.
- `@domain-primitives/time`: supplies `DAY_SECONDS`.
- `@infrastructure/persistence/serialize`: supplies `applySerialization`.
- `./repository`: runs the queries, including `clearLinesIfUnchanged`, which compares against `__v`. It uses `{ userId }` upserts through `findOneAndUpdate`.
- `./services/view`: `readCartLines` builds `CartResponse` by hand and joins products through `@modules/products` (`findManyByIds`), not through this model.
- `applyCartTransform` is there because every repository owes the repository factory a transform (`normalize` in `@infrastructure/persistence/create-repository`).
- The listed test files (integration, unit and concurrency) exercise the schema, retention and concurrent behavior.

## Notes
- **Changing the retention window:** Mongo won't alter an existing index's `expireAfterSeconds` in place. Changing `NODE_CART_RETENTION_DAYS` and restarting fails the boot. Run `npm run db:sync` to drop and rebuild the index.
- **TTL clock:** the TTL runs on `updatedAt`, so any change to the cart restarts it.
- **`__v` is read by application code:** checkout empties the cart conditionally on the version it read, which stops two parallel checkouts from producing two orders.
- **Line ids:** lines have no `_id` because they are addressed by product. A line would need its own id only if one product could fill two lines (variants or options).
- **No cart id on the wire:** `CartResponse` is a computed `{ items, summary }` view, and no endpoint serves this document's shape.
- **Hard max vs. shop max:** the hard max stays a constant so stored lines remain valid if the configured limit is raised and then lowered.
