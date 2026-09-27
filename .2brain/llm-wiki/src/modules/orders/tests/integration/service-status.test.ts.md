---
source: src/modules/orders/tests/integration/service-status.test.ts
sha256: ac1d78a5d71ee841e4938f3056f5bb638cd6adfee51e176a1770f8d051daa93b
generated_at: 2026-09-27T15:20:27.152340+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/service-status.test.ts

## Purpose

Integration tests for the five order-status transition functions (`markPaid`, `markProcessing`, `markShipped`, `markDelivered`, `markFulfilled`). Runs against a **real MongoDB** instance (not mocks) to verify three guarantees: valid transitions land the write and emit exactly one domain event, invalid transitions return `null` and emit nothing, and concurrent callers racing the same transition produce exactly one successful write.

## Key elements

- **`describe('markPaid')`** — asserts `pending → paid` succeeds and emits `ORDER_STATUS_CHANGED`; parameterized test confirms `paid`, `processing`, `cancelled` are all rejected.
- **`describe('markProcessing')`** — asserts `paid → processing`; rejects from `pending`; also confirms the function is reachable via the `orderService` aggregate object.
- **`describe('markShipped')`** — asserts `processing → shipped`; rejects from `paid`.
- **`describe('markDelivered')`** — asserts `shipped → delivered`; rejects from `processing`.
- **`describe('markFulfilled')`** — the "digital-only" shortcut `processing → delivered`; rejects from `paid`; includes a dedicated test proving it does **not** satisfy `markDelivered`'s own `shipped` gate (the two edges into `delivered` remain independent).
- **`describe('two callers racing the same move')`** — fires two concurrent `markPaid` calls via `Promise.all`; asserts exactly one caller gets a non-null result and exactly one event fires.
- **`afterEach(() => resetDomainEvents())`** — clears the global event subscriber after every test to prevent cross-test contamination.

## Relationships

- **`src/modules/orders/services/status.ts`** — the module under test; source of all five `mark*` functions.
- **`src/modules/orders/services/index.ts`** — provides `orderService`, used to verify the transitions are also exposed on the aggregate service object.
- **`src/modules/orders/events.ts`** — source of the `ORDER_STATUS_CHANGED` event constant that tests subscribe to.
- **`src/kernel/events.ts`** — provides `onDomainEvent` (subscribe) and `resetDomainEvents` (cleanup) for the in-process event bus.
- **`src/modules/orders/tests/factories.ts`** — provides `seedOrder` (insert a document at a given status) and `readOrder` (verify persisted state).
- **`src/types/index.ts`** — provides the `OrderStatus` enum used in all assertions.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` spins up the real MongoDB instance before the suite runs.

## Notes

- The file header states the design intent explicitly: a mock cannot reproduce the conditional-write (`$in` filter) race, so a real database is required.
- Invalid transitions are verified two ways: the return value is `null` **and** no event was emitted.
- `markFulfilled` is a distinct path into `delivered` (from `processing`), not an alias for `markDelivered` (from `shipped`). A dedicated test guards against the two edges accidentally merging.
- The race test relies on MongoDB's single-document atomicity; it would pass trivially with a mock, which is why the real DB is used.
