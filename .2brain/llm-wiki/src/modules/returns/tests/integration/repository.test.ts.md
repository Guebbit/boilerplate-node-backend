---
source: src/modules/returns/tests/integration/repository.test.ts
sha256: 4c7ed740b7a777196b95b8a1c1259b22cc6328a50a2d67b83548562f2e3c978f
generated_at: 2026-10-15T12:00:11.833305+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/integration/repository.test.ts

## Purpose

Integration tests for the **read** side of the return repository (`findByOrderId`, `findByOrderIds`) against a real database. Verifies that results are always sorted oldest-first regardless of write order, and that a read within a transaction can see that same transaction's uncommitted write.

## Key elements

- **`setupTestDb()`** — called once at module level to initialise the test database.
- **`orderWithWriter()`** (local helper) — creates a user, a product, and a *delivered* order, then returns an `orderId` plus a `write(reason, createdAt?)` closure that calls `returnModel.create` with a fixed timestamp. Keeps each test self-contained.
- **`describe('reading returns by order')`** — three test cases:
  - *oldest first by insertion order* — writes three returns with non-sequential timestamps, asserts `findByOrderId` returns them sorted by `createdAt` ascending.
  - *oldest first via `findByOrderIds`* — same ordering guarantee for the multi-order (account-export) read path.
  - *read-your-own-write inside a transaction* — opens a `withTransaction`, writes a return via `returnModel.create(…, { session })`, then reads via `returnRepository.findByOrderId(orderId, session)` and asserts the row is visible before commit; a post-commit read confirms persistence.

## Relationships

- **`../../repository`** (`src/modules/returns/repository.ts`) — the unit under test; calls `findByOrderId` and `findByOrderIds`.
- **`../../model`** (`src/modules/returns/model.ts`) — `returnModel.create` used directly to seed rows and to write inside the transaction test.
- **`@infrastructure/runtime/database`** — `withTransaction` provides the transactional session for the read-your-own-write test.
- **`@tests/setup-test-db`** (`tests/support/setup-test-db.ts`) — bootstraps the in-memory/real test DB connection.
- **`@modules/users/tests/factories`**, **`@modules/products/tests/factories`**, **`@modules/orders/tests/factories`** — create the prerequisite user, product, and delivered order.
- **`@types`** (`src/types/index.ts`) — `OrderStatus.delivered` ensures the order is in a state that permits a return.
- **`../../domain`** (`src/modules/returns/domain/index.ts`) — `ReturnReason` type for the reason field.

## Notes

- The `orderWithWriter` helper hard-codes a **delivered** order status; returns are only valid against delivered orders, so any test that omits this will fail at the repository level.
- The transaction test passes the `session` object from `withTransaction` into **both** the model write (`returnModel.create(…, { session })`) and the repository read (`findByOrderId(orderId, session)`). Omitting the session on the read would hit the default connection and fail to see the uncommitted row.
- `createdAt` is explicitly set on each write to make the sort-order assertions deterministic; without it, timestamps would be identical (same millisecond) and ordering would be non-deterministic.
