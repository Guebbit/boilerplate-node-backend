---
source: src/modules/orders/tests/integration/schema-contract.test.ts
source_sha256: 29f32af184b17e4acc30779184d55aa1de910f444e047d737cfd69aa59d415d4
context_sha256: 1226e7f6f1cb7a092097c97f59aadc0aca36a08070d3fa58d282d07bccfda0e3
generated_at: 2026-11-22T06:32:41.830726+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/tests/integration/schema-contract.test.ts

## Purpose
Integration spec covering the declarations of the order schema (serialisation shape, which paths exist on the embedded product snapshot) rather than behaviour handled by sibling specs. It runs against a real Mongo, since these are Mongoose behaviours and a mock would only assert its own idea of them. The module doc also mentions defaults, per-field `required`, and `select: false` on credentials, and a closing comment introduces cart `userId` uniqueness. Only the order-schema tests are visible in the content provided.

## Key elements
- `setupTestDb()` — called at module level to set up the test database.
- `makeOrderPayload` — async helper that builds a valid order payload:
  - Creates a user (`buyer@example.com`) and a product (title `Bought`, price `12.50`).
  - Embeds the product as a snapshot: `taxClass` is removed and replaced by `taxRate` from `resolveTaxRate(taxClass)`.
  - Uses `orderNumber` `2026-000001`, currency `EUR`, and one item with quantity 2 and locale `en`.
- `describe('order schema')` tests:
  - **Serialises to id** — `toJSON()` exposes `id` (equal to `String(_id)`) and omits `_id` and `__v`.
  - **Drops onHand/reserved** — the live product's `onHand`/`reserved` pass through `toObject()` but are absent after persistence, as is `available`. This shows the embedded `orderLineProductSchema` declares no path for them.

## Relationships
- `src/modules/orders/repository.ts` — imported as `orderRepository`, used to create the orders under test.
- `src/modules/products/tests/factories.ts` — `createProduct` supplies the live product that is snapshotted.
- `src/modules/users/tests/factories.ts` — `createUser` supplies the buyer.
- `src/modules/products/index.ts` — `resolveTaxRate` converts the product's `taxClass` to a `taxRate`. The file's comments say `freezeOrderLines` does the same, but that function is not imported here.
- `tests/support/setup-test-db.ts` — `setupTestDb` (imported via the `@tests` alias) provides the DB lifecycle.
- `src/modules/products/tax.ts` — a graph neighbor, but not imported directly in the visible content; `resolveTaxRate` comes via the products index.

## Notes
- An order's `items[].product` is an embedded snapshot, not a reference. A bare ObjectId fails validation because title, price and `taxRate` are required on the embedded copy.
- The snapshot omits the live product's `taxClass` and stores the resolved `taxRate`.
- The trailing comment about carts and a unique `userId` has no test beneath it in the visible content.
