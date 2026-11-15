---
source: src/modules/orders/tests/integration/notes.test.ts
sha256: 93730f14cb7f4417430cad3a059e440e3e6bad5e1a4d7f1d650fd53c06f58a78
generated_at: 2026-11-14T20:52:58.177761+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/notes.test.ts

## Purpose

Integration tests for the staff-note endpoints (`POST` and `DELETE /orders/{id}/timeline/notes`) run over real HTTP against a real Mongo. They verify the full lifecycle of a note: creation, staff-only visibility, encryption at rest, inclusion in buyer data export (without author), audit logging by length only, time-based text scrubbing, erasure with the order, and withdrawal (soft delete that keeps the row but unsets text).

## Key elements

- **`seed()`** – Creates a paid order for a signed-in buyer, returns buyer/staff bearer tokens and the order ID.
- **`leaveNote` / `leaveStatus` / `writeNote` / `deleteStatus`** – Thin HTTP helpers around the two endpoints; `writeNote` additionally extracts the `Location` header for the DELETE path.
- **`describe('POST /orders/{id}/timeline/notes')`** – 8 tests covering 201 response shape, staff-vs-buyer visibility, encryption at rest (raw collection contains no plaintext), order-id integrity (rejects a note whose `orderId` was tampered with in Mongo), data-export inclusion/exclusion, audit-by-length, 403 for non-staff, and 404/422 edge cases.
- **`describe('the note's life after it is written')`** – 2 tests: text-clock retention (`NODE_ORDER_EVENT_TEXT_RETENTION_DAYS`) and scrubbing on scheduled buyer-erasure.
- **`describe('DELETE /orders/{id}/timeline/notes/{eventId}')`** – 4 tests: 204 with row kept but text unset, audit-by-length on withdrawal, 404 on double-delete / wrong-order / wrong-row-type, and 403 for non-staff.

## Relationships

- **`src/modules/orders/services/index.ts`** – The order service is called directly (bypassing HTTP) for service-level assertions such as timeline reads, data-export collection, text scrubbing, and order anonymisation.
- **`src/modules/orders/model.ts`** – `orderEventModel` is used to inspect the raw Mongo collection (encryption check) and to perform deliberate tampering (order-id swap test).
- **`src/modules/orders/audit.ts`** – `ordersAuditActions` is imported to filter observed audit events by action name.
- **`src/infrastructure/observability/audit.ts`** – The audit port is replaced with a mock (see `tests/support/ports.ts` for the mechanism); the real implementation is never invoked.
- **`src/kernel/events.ts`** – `resetDomainEvents()` is called in `afterEach` to clear the in-memory domain-event bus between tests.
- **`src/modules/orders/tests/factories.ts`** – Provides `createOrder`, `toOrderItem`, and `timelineOf` for seeding and assertion.
- **`src/modules/products/tests/factories.ts`** – `createProduct` for order-item setup.
- **`src/modules/users/tests/factories.ts`** – `eraseAsScheduled` to trigger the buyer-erasure flow.
- **`src/types/index.ts`** – `OrderStatus` enum used in seed setup.
- **`tests/support/ports.ts`** – Supplies `observePort` (audit spy) and the replacement implementation for the audit port.
- **`tests/support/http.ts`** – `api`, `authenticateAs`, `authenticateAsRole` for real-HTTP calls.
- **`tests/support/environment.ts`** – `setEnvironment` to configure retention-days per test.
- **`tests/support/callers.ts`** – `asAdmin()` for service-level calls.
- **`tests/support/checkout-modules.ts`** – `registerCheckoutModules` needed for the erasure-path test.
- **`tests/support/setup-test-db.ts`** – Initialises the real Mongo test database.

## Notes

- The audit port is **replaced**, not spied on (see `tests/support/ports.ts` for the rationale); use `observePort(auditPort.emitAuditEvent)` to inspect calls.
- DELETE is a soft delete: the timeline row persists with `type: 'note_added'` intact but the `text` field is unset. Tests assert the row still exists and appears in exports without text.
- The "order-id tamper" test writes directly to Mongo via `orderEventModel.collection.updateOne` to simulate a consistency violation, then asserts the service layer rejects the row.
- Audit events record `metadata.length` (character count) but never the note text itself—tests explicitly assert the raw audit JSON does not contain the note string.
- `resetDomainEvents()` in `afterEach` is required because the services emit to the in-memory kernel event bus; without it, events leak across tests.
