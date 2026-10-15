---
source: tests/integration/staff-reads.test.ts
sha256: 4d1af0e0a85ff84c794eb57218fca3ba41fcb65c0a8ecd89fd9b2a3226dded8d
generated_at: 2026-10-15T12:54:49.056291+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/staff-reads.test.ts

## Purpose

Integration test verifying that the audit logger emits an `admin.<resource>.viewed` entry when a staff member opens **another user's** detail record, and does **not** emit one for self-views or list endpoints. Exercises `GET /users/{id}`, `GET /orders/{id}`, and `GET /returns/{id}` over real HTTP with the test database.

## Key elements

- **`viewed(): Entry[]`** — helper that pulls `*.viewed` entries out of the `auditLogger.log` spy calls (reads the 3rd argument, `call[2]`).
- **`shopWithOrder()`** — async fixture: creates a product, a processing order for a customer, ships it via `carryOrderTo`, and returns `{ customer, admin, orderId }`.
- **`auditSpy`** — `jest.spyOn(auditLogger, 'log')` set up in `beforeEach`, restored in `afterEach`. Individual tests call `auditSpy.mockClear()` before the action under test.
- **`Entry`** (local interface) — minimal shape `{ action, actorUserId?, targetType?, targetId? }` used for assertions.
- Three `describe` blocks covering `users`, `orders`, and `returns` detail routes; each asserts the positive (staff views other) and negative (self-view / list) cases.

## Relationships

- **`tests/support/http.ts`** — provides `api()` (supertest-style client) and `authenticateAs(role)` used for every request.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called once at module scope to seed a clean database.
- **`src/infrastructure/adapters/logger.ts`** — exports `auditLogger`; the test spies on its `.log` method to capture audit entries.
- **`src/modules/products/tests/factories.ts`** — `createProduct` builds a product for the order fixture.
- **`src/modules/orders/tests/factories.ts`** — `createOrder` / `toOrderItem` build the order used in the fixture.
- **`src/modules/delivery/tests/factories.ts`** — `carryOrderTo` transitions the order to `shipped` so a return can reference it.
- **`src/types/index.ts`** — supplies `OrderStatus.processing` used when creating the initial order.

## Notes

- The module docstring explicitly states these are **detail routes only** over **real HTTP**; list endpoints and self-views are the negative cases, not separate suites.
- The returns test creates the return as the customer (`POST /returns`), then reads it as both customer and admin in the same test case to contrast the two behaviors.
- `viewed()` relies on `log` being called with the entry as its **third** positional argument (`call[2]`); if the logger signature changes, the helper silently breaks.
- `auditSpy.mockClear()` is called *inside* individual tests (after `beforeEach` has installed the spy) to isolate each assertion, rather than relying on a fresh spy per test.
