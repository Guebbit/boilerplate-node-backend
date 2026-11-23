---
source: src/modules/returns/tests/integration/repository.test.ts
source_sha256: 37b2915822269335265b3be73e61b07803cd600b0b6fa259aa509bd997706b9a
context_sha256: c3bb0bf30087a8ef5bae581cccfc7a785292d9c6071a9081f38e67d202f36558
generated_at: 2026-11-22T07:36:38.725988+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/tests/integration/repository.test.ts

## Purpose
Integration tests for the per-order read methods of `returnRepository`, run against a real test database. They verify that returns come back oldest first regardless of insertion order, and that a read inside a transaction sees that transaction's own uncommitted write.

## Key elements
- `setupTestDb()` is called at module level to prepare the test database.
- `orderWithWriter()` is a local helper. It creates a user (`repository-reads@example.com`), a product (Shirt, 30.00) and a delivered order. It returns the `orderId` as a string and a `write(reason, createdAt?)` function. `write` inserts a `requested` return through `returnModel.create`, with an optional explicit `createdAt`.
- Test "lists one order's returns oldest first": writes returns dated 2031-01-03, 2031-01-01 and 2031-01-02, then expects `findByOrderId` to give the reasons `other`, `wrong_item`, `defective`.
- Test "lists many orders' returns oldest first too, for the account export": the same ordering check for `findByOrderIds([orderId])`.
- Test "sees, inside a transaction...": inside `withTransaction`, creates a return with the session, then calls `findByOrderId(orderId, session)`. It expects 1 row inside the transaction and 1 row from a read after commit.

## Relationships
- `returnRepository` (`../../repository`) is the code under test: `findByOrderId(orderId, session?)` and `findByOrderIds(ids)`.
- `returnModel` (`../../model`) is used directly to seed return documents.
- `ReturnReason` (type, `../../domain`) types the `write` helper's reason parameter.
- `withTransaction` (`@infrastructure/runtime/database`) provides the session for the transaction test.
- `setupTestDb` (`@tests/setup-test-db`) sets up the database.
- The user, product and order factories (`createUser`, `createProduct`, `createOrder`, `toOrderItem`) seed the fixtures.
- `OrderStatus` (`@types`) supplies `delivered` for the order status.

## Notes
- Ordering tests set `createdAt` explicitly, to dates in 2031, so the result is not tied to insertion order.
- The transaction test creates its return with `lines: []`. The other tests use one line.
- The transaction test creates the return inside the callback, but `findByOrderId` is called there with the session and without a session afterwards. The final unsessioned read only returns 1 row once the transaction has committed.
