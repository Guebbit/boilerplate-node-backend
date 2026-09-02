# src/modules/orders/demo.ts

## Purpose

Builds and seeds the `orders` collection's demo dataset. It constructs a set of deterministic order documents (snapshots of products, varied customer tiers, a soft-deleted order, a shipping-bearing order) and exposes functions to upsert them into the collection and to re-read the serialized result for frontend consumption.

## Key elements

- **`snapshotOf(productId)`** — Calls `seedProductById` (throws on unknown id) and reshapes the live catalogue row into an `OrderSnapshotInput`; the order book owns what a product snapshot contains.
- **`line(productId, quantity)`** — Wraps a snapshot with a quantity to form one order item.
- **`demoOrderId(index)`** — Produces a deterministic 24-hex-char id with a fixed `67f0c4` prefix, keeping the id space disjoint from other collections.
- **`namedOrders`** (internal) — Three hand-written orders: one with a stale email + out-of-stock line, one with explicit `shippingMethod`/`shippingCost`/`shippingAddress`, and one soft-deleted order on the non-admin user.
- **`ginoOrders`** (internal) — Three larger orders for the "large" customer (`ginopinoshow`), using `fillerProductId` for varied lines.
- **`smallCustomerOrders`** (internal) — One single-line order each for seven small-tier customers.
- **`MEDIUM_ORDERS` / `mediumCustomerOrders`** (internal) — Two orders each for three medium-tier customers, two-to-three lines apiece.
- **`orderFixtures`** (exported) — Concatenated array of all orders above.
- **`seedOrdersCollection()`** (exported) — Upserts every fixture via `upsertById(orderRepository, order)` concurrently; returns `SeedOutcome[]`.
- **`exportSeededOrders()`** (exported) — Reads the collection back through `exportCollection(orderModel, …)`, yielding API-shaped rows (with derived `totalItems`/`totalQuantity`/`totalPrice`).

## Relationships

- **`src/modules/products/demo.ts`** — Imports `SEED_PRODUCT_IDS`, `fillerProductId`, `seedProductById`. Every product reference in this file is resolved through that module's catalogue; a missing product throws.
- **`src/modules/users/demo.ts`** — Imports `SEED_CUSTOMER_IDS` and `SEED_CUSTOMER_EMAILS` to bind orders to the seven small + three medium customers.
- **`src/kernel/seed-accounts.ts`** — Imports `SEED_ADMIN_ID`/`SEED_ADMIN_EMAIL`/`SEED_USER_ID`/`SEED_USER_EMAIL` for the admin and `ginopinoshow` orders.
- **`src/modules/orders/fixtures.ts`** — Imports `makeOrder` and the `OrderSnapshotInput` type used to shape every fixture.
- **`src/modules/orders/model.ts`** — Imports `orderModel`; used by `exportSeededOrders` to serialize via Mongoose.
- **`src/modules/orders/repository.ts`** — Imports `orderRepository`; the target of every `upsertById` call in `seedOrdersCollection`.
- **`src/infrastructure/persistence/seed.ts`** — Imports `upsertById`, `SeedOutcome`, and `exportCollection` for the write and read paths.
- **`src/modules/orders/module.ts`** — Declares/re-exports `seedOrdersCollection` so `db/demo/index.ts` can invoke it without reaching into this file directly.

## Notes

- **Snapshot-by-lookup, not restatement.** Product fields are copied from `seedProductById` at seed time. If a fixture needs a product value that differs from the live catalogue, the caller must state it explicitly after the lookup.
- **No `reserved` writes on purpose.** The seeder runs all module seeders concurrently; calling `reserveForOrder` would race with `products/demo.ts` writing the same document. All seeded products therefore honestly have `reserved: 0`.
- **Stale data is intentional.** The first named order carries `oldpsw@root.it` (a pre-change email) and the soft-deleted order's `deletedAt` precedes its own `createdAt`. These encode business properties (order remembers send-to address; soft-delete flag presence) that the dataset is meant to exercise, not bugs.
- **`shippingCost: 0` is a frozen price.** It reflects what `priceShipping` decided at checkout (free above the threshold), not the current rate card. The order is a historical record.
- **No edge on `users` or `account` modules.** Customer emails/ids come from the kernel seed-accounts or the users demo constants; the shipping address is restated inline rather than imported from the account module.
- **Id prefix `67f0c4`** is fixed and distinct from the hex prefix of any other collection's demo ids, preventing cross-collection id collisions in seed output.
