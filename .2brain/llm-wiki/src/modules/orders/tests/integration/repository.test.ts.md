---
source: src/modules/orders/tests/integration/repository.test.ts
sha256: b3fdbd6156cf690e33aa015e76c3800f9ba27b3ee06585c4a85b9999b6cca2ce
generated_at: 2026-11-08T07:08:39.251865+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/repository.test.ts

## Purpose

Integration tests for `orderRepository` that verify three contracts: (1) `create` persists a full order with embedded product snapshots, (2) `aggregate` is a raw passthrough that does not reshape Mongo pipeline stages, and (3) `findByIdScoped` always returns a hydrated Mongoose document regardless of whether a scope is applied.

## Key elements

- **`describe('create')`** — four tests confirming insertion returns a Mongoose doc, stores quantities, embeds a product snapshot (title + price as strings, not an ObjectId), and supports multiple line items.
- **`describe('aggregate')`** — five tests pinning passthrough behavior: match-all, `$match` filtering, `$count`, `$addFields` with `$sum`/`$map`/`$multiply` (asserting `toMinorUnits` on the Decimal128 result), and the `$sort` + `$skip` + `$limit` pagination pattern using `DEFAULT_SORT`.
- **`describe('findByIdScoped')`** — two tests: (a) both scoped and unscoped calls return the same hydrated shape (checks `_id` and `.toJSON` exist), and (b) a scope that does not cover the order returns `undefined`.
- **`setupTestDb()`** — called once at module level; resets and prepares a dedicated test database.

## Relationships

- **`src/modules/orders/repository.ts`** — the module under test; all assertions target its `create`, `aggregate`, `findByIdScoped`, and `ownerScope` exports.
- **`src/modules/orders/tests/factories.ts`** — provides `createOrder`, `makeOrder`, `toOrderItem` used to seed realistic orders.
- **`src/modules/users/tests/factories.ts`** — `createUser` builds the owning user per test.
- **`src/modules/products/tests/factories.ts`** — `createProduct` builds the embedded product snapshot.
- **`src/domain-primitives/money.ts`** — `toMinorUnits` converts the Decimal128 `totalPrice` from the `$addFields` aggregate into an integer for assertion.
- **`src/infrastructure/persistence/search.ts`** — `DEFAULT_SORT` is used as the `$sort` stage in the pagination test, ensuring the tiebreaker contract is exercised.
- **`tests/support/setup-test-db.ts`** — `setupTestDb` initialises/cleans the test database before the suite runs.

## Notes

- **Empty-pipeline guard:** Mongoose throws `Aggregate has empty pipeline` if you pass `[]`; the match-all test therefore uses `[{ $match: {} }]` as the minimal valid pipeline.
- **Embedded snapshot, not reference:** `order.items[i].product` is a plain object (frozen snapshot), not an ObjectId — no `.populate()` is involved.
- **`findByIdScoped` shape pin:** The tests explicitly check for `_id` and `.toJSON` because both a hydrated doc and a plain wire-shaped row serialize `id` identically; only the document-specific properties distinguish them.
- **Pagination sort must be total:** The `$sort` stage preceding `$skip` must include a tiebreaker (enforced via `DEFAULT_SORT`); otherwise page boundaries are non-deterministic.
- **Distinct emails in scope test:** `users.email` is unique, so the "stranger" user must be created with a non-default email to avoid a factory collision.
