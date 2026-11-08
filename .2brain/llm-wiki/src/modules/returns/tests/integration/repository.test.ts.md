---
source: src/modules/returns/tests/integration/repository.test.ts
sha256: 37b2915822269335265b3be73e61b07803cd600b0b6fa259aa509bd997706b9a
generated_at: 2026-11-08T08:10:03.668154+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/integration/repository.test.ts

## Purpose

Integration tests for the return repository's **read** path against a real database. Verifies two invariants: (1) `findByOrderId` / `findByOrderIds` always return rows ordered oldest-first regardless of write order, and (2) a read issued inside a transaction sees that same transaction's uncommitted write.

## Key elements

- **`orderWithWriter`** – async helper that creates a user, product, and a delivered order, then returns `{ orderId, write }` where `write(reason, createdAt?)` inserts a return via `returnModel.create`. The optional `createdAt` lets tests control the ordering key explicitly.
- **`describe('reading returns by order')`** – the single suite containing three cases:
  - *oldest-first ordering* – writes three returns out of chronological order, asserts `findByOrderId` returns them sorted by `createdAt`.
  - *`findByOrderIds` ordering* – same guarantee through the bulk-lookup used by account export.
  - *transaction visibility* – inside `withTransaction`, writes a return then calls `findByOrderId` with the same `session`; asserts the row is visible before commit and still present after.

## Relationships

- **`src/modules/returns/repository.ts`** – the unit under test (`returnRepository.findByOrderId`, `findByOrderIds`).
- **`src/modules/returns/model.ts`** – `returnModel.create` is used directly to seed data and to write inside the transaction test.
- **`src/modules/returns/domain/index.ts`** – supplies the `ReturnReason` type.
- **`src/infrastructure/runtime/database.ts`** – `withTransaction` drives the transaction-visibility test.
- **`src/modules/users/tests/factories.ts`**, **`src/modules/products/tests/factories.ts`**, **`src/modules/orders/tests/factories.ts`** – provide `createUser`, `createProduct`, `createOrder`, `toOrderItem` for fixture setup.
- **`src/types/index.ts`** – `OrderStatus` enum used to mark the order as `delivered`.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` initialises the real test database at module load.

## Notes

- `setupTestDb()` is called at **module scope** (not inside a `beforeEach`), so the suite assumes a clean database per run; there is no per-test isolation beyond fresh fixtures.
- Test dates are hardcoded to **2031** to guarantee they are unambiguously in the future and avoid clock-skew flakiness.
- The transaction test passes the `session` object explicitly to `findByOrderId`; calling the repository without a session (the post-commit assertion) goes through the default connection.
- `orderWithWriter` always creates a single-line order with a fixed product; it is not parameterised for multi-line scenarios.
