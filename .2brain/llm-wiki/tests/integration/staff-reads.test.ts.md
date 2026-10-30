---
source: tests/integration/staff-reads.test.ts
sha256: 83692a906c853c23496bfd3dd18b72d4112b415e26e2ec3eb8434c01fbada8c1
generated_at: 2026-10-29T07:03:48.817270+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/staff-reads.test.ts

## Purpose

Integration test verifying that the audit log records an `admin.<resource>.viewed` entry **only** when a staff member opens another user's detail record. It confirms the opposite (no entry) for a customer reading their own record and for list endpoints. Three resources are covered: users, orders, and returns. Requests go over real HTTP against a seeded test database.

## Key elements

- **`Entry` interface** — the shape of one audit log call as the logger receives it (`action`, `actorUserId`, `targetType`, `targetId`).
- **`auditSpy`** — `jest.spyOn(auditLogger, 'log')`, re-created in `beforeEach` and restored in `afterEach`.
- **`viewed()`** — helper that pulls the **third** positional argument (`call[2]`) from every spy invocation and filters to actions matching `/^admin\.\w+\.viewed$/`.
- **`shopWithOrder()`** — seeds a customer, an admin, a product, and a processing order, then advances the order to *shipped* via `carryOrderTo`. Returns `{ customer, admin, orderId }`.
- **`describe('GET /users/{id}')`** — three cases: admin views another account (records), admin views own account (no record), list endpoint (no record).
- **`describe('GET /orders/{id}')`** — three cases: staff views customer's order (records), customer views own order (no record), list endpoint (no record).
- **`describe('GET /returns/{id}')`** — single test that creates a return via `POST /returns`, then asserts the customer's GET is silent while the admin's GET records `admin.return.viewed`.

## Relationships

- **`tests/support/http.ts`** — provides `api()` (supertest-style HTTP client) and `authenticateAs(role)` (returns a bearer token + user object).
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called once at module scope to guarantee a clean database per test run.
- **`src/infrastructure/adapters/logger.ts`** — exports `auditLogger`; the test spies on its `.log` method to capture and assert audit entries.
- **`src/modules/products/tests/factories.ts`** — `createProduct` seeds a catalog item for the order.
- **`src/modules/orders/tests/factories.ts`** — `createOrder` and `toOrderItem` seed an order with one line item.
- **`src/modules/delivery/tests/factories.ts`** — `carryOrderTo` transitions the order to `shipped`, creating the shipment that a return references.
- **`src/types/index.ts`** — `OrderStatus` enum used when creating the order fixture.

## Notes

- The audit entry is asserted as the **third** positional argument to `auditLogger.log` (`call[2]`). If the logger's signature changes, every `expect` block in this file breaks silently — the `viewed()` helper will return wrong-shaped objects.
- `auditSpy.mockClear()` is called inside each test body (after fixture setup) so that only the action under test is inspected; the spy itself is re-created per test via `beforeEach`/`afterEach`.
- The test relies on the delivery state machine (`carryOrderTo` → *shipped*) to make the order eligible for a return; skipping that step would cause `POST /returns` to fail.
- No mocks are applied to controllers, middleware, or the database — only `auditLogger.log` is intercepted. All routing, auth, and persistence run for real.
