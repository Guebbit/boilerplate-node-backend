---
source: src/modules/cart/tests/unit/schema-contract.test.ts
source_sha256: 5ee84b28f4efb626fd206e5863516e06e9a867b6e8c13142a25e32867dd8524a
context_sha256: 462650d47c36bf5dff2d696af136ca6092c9a2d7f74967f2d5faec37397bd696
generated_at: 2026-11-22T04:43:56.559173+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/cart/tests/unit/schema-contract.test.ts

## Purpose
Unit tests that pin down the contract of the cart Mongoose schema (`cartSchema`). They assert the boundary between the cart and wishlist features (a cart line has `quantity`, a wishlist line does not) and verify that `unique: true` on `userId` makes "one cart per user" a database-level guarantee, so mutations can be a single `findOneAndUpdate(upsert: true)` with no prior read.

## Key elements
- `RETENTION_SECONDS` — the expected TTL, computed as `NODE_CART_RETENTION_DAYS` (default 365) × 24 × 60 × 60, read via `currentEnvironment()`.
- `describe('cartSchema')` — top-level schema checks:
  - Only `userId` is required.
  - `userId` has a unique index.
  - `items` defaults to `[]`.
  - `userId` is an `ObjectId` with `ref: 'User'`.
  - The exact index list is `carts_updatedAt_ttl`, `items.productId_1` and `userId_1`. The `items.productId` index exists because product deletion must find every cart holding that product.
  - Only the `updatedAt` index carries `expireAfterSeconds` (equal to `RETENTION_SECONDS`), and only `userId_1` is unique.
  - `timestamps` is `true`.
- `describe('cartSchema — a line')` — checks on the `items` sub-schema:
  - Required paths are `productId` and `quantity`.
  - `_id` is disabled.
  - `productId` has no `ref`.
  - `quantity` has `min` of 1.
  - Path names are exactly `['productId', 'quantity']`.

## Relationships
- `@modules/cart/model` (`src/modules/cart/model.ts`) — supplies `cartSchema`, the only thing under test.
- `@tests/schema` (`tests/support/schema.ts`) — provides the schema-introspection helpers used in every assertion: `requiredPaths`, `indexSpecs`, `indexOptionSpecs`, `defaultOf`, `typeOf`, `refOf`, `optionsOf`, `pathOptions`, `pathNames`, `subSchema`.
- `@infrastructure/config/store` (`src/infrastructure/config/store.ts`) — `currentEnvironment()` supplies `NODE_CART_RETENTION_DAYS` so the TTL assertion follows configuration.

## Notes
- The TTL test compares against the configured window rather than a literal. Changing `NODE_CART_RETENTION_DAYS` therefore moves the policy and the test together, and a TTL appearing on any other index fails the test.
- The 365-day fallback in the test mirrors the model's own default, so the two must stay in sync.
- `productId` deliberately has no `ref` to `Product`. Per the in-test comment, `src/modules/cart/services/view.ts` joins through `productService` rather than Mongoose `populate()`.
- `quantity` has `min: 1` because a zero-quantity line is a removal that did not remove. Removal means deleting the line.
- Index and option assertions use the helpers' string format (e.g. `'userId_1: unique=true'`, `'items.productId_1: (none)'`) and are order-sensitive.
