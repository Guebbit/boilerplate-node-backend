---
source: tests/integration/staff-reads.test.ts
sha256: 944ae247fc051d0de9893df1836c01e3893e13438607eb61478ad44c50ded8a0
generated_at: 2026-11-08T09:48:52.888729+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/staff-reads.test.ts

## Purpose

Integration test verifying that the audit logger records an `admin.<resource>.viewed` entry **only** when a staff/admin opens another user's detail record. It asserts the entry is *absent* when a user reads their own record, when an admin reads their own record, and on list endpoints. Covers three resources: users, orders, and returns, all over real HTTP.

## Key elements

- **`auditSpy`** – A `jest.SpyInstance` on `auditLogger.log`, created in `beforeEach` and restored in `afterEach`. All assertions read from this spy.
- **`viewed()`** – Helper that pulls the third argument (`Entry`) out of each spy call and filters to entries matching `/^admin\.\w+\.viewed$/`.
- **`shopWithOrder()`** – Sets up a customer with a shipped order (via `carryOrderTo`) and returns `{ customer, admin, orderId }` so each test block starts from a realistic state.
- **`describe('GET /users/{id}')`** – Three cases: admin views another user (entry logged), admin views self (no entry), list endpoint (no entry).
- **`describe('GET /orders/{id}')`** – Three cases: admin views customer's order (entry logged), customer views own order (no entry), list endpoint (no entry).
- **`describe('GET /returns/{id}')`** – Single combined case: customer creates a return, reads it (no entry), admin reads it (entry logged).

## Relationships

- **`tests/support/http.ts`** – Provides `api()` (supertest-style HTTP client) and `authenticateAs()` for role-scoped tokens.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` is called at module level to prepare a clean database before any test runs.
- **`src/infrastructure/adapters/logger.ts`** – Exports `auditLogger`; the test spies on its `.log` method to capture and assert audit entries.
- **`src/modules/products/tests/factories.ts`** – `createProduct` seeds a product for the order.
- **`src/modules/orders/tests/factories.ts`** – `createOrder` and `toOrderItem` build the order fixture.
- **`src/modules/delivery/tests/factories.ts`** – `carryOrderTo` advances the order to `shipped` so a return can reference it.
- **`src/types/index.ts`** – Exports `OrderStatus` used to set the initial order status to `processing`.

## Notes

- `auditSpy.mockClear()` is called **after** fixture setup in every test to ensure only the target viewing action is inspected—setup itself may emit other audit entries.
- The `Entry` shape (`action`, `actorUserId`, `targetType`, `targetId`) is an informal contract on the third positional argument of `auditLogger.log`; if the logger signature changes, this test breaks silently (the cast to `Entry` is unchecked).
- The returns test requires the order to be *shipped* (not merely `processing`) because the return endpoint validates that a shipment exists.
- Assertions use `expect.objectContaining` rather than full equality, so extra fields on the audit entry won't cause false failures.
