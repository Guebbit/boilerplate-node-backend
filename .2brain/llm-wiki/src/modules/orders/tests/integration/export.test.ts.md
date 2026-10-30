---
source: src/modules/orders/tests/integration/export.test.ts
sha256: 2c5cf325c4ee40fa3811a84c1be684d2ac893c8419e138ccb13b95ae0bcc02e1
generated_at: 2026-10-29T04:53:07.441570+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/export.test.ts

## Purpose

Integration tests for `orderService.openOrderExport`, exercised against a real Mongo database. Covers the CSV contract (column order, one row per match, no address fields, formula-injection escaping, read-scope enforcement), the row-count cap refusal, and the audit event's content and exclusions.

## Key elements

- **`csvOf`** – Unwraps a successful `openOrderExport` result into a `Promise<string>` of CSV text; throws a descriptive error if the service returned a refusal instead of a stream.
- **`orderOf(email, status?, createdAt?)`** – Creates a user, product, and single-item order so tests can seed data with a specific email/status/timestamp.
- **`staff`** – Pre-built admin caller context (`admin-1`) passed as the third argument to every `openOrderExport` call.
- **`describe('the file')`** – Verifies header column order, row count, ordering by `createdAt`, absence of address fields, single-quote escaping of formula-like cells, and that a customer caller sees only their own orders.
- **`describe('the cap')`** – Sets `NODE_ORDER_EXPORT_MAX_ROWS` via `setEnvironment`; asserts a 422 refusal with `ORDER_EXPORT_TOO_LARGE` when over the cap (and no audit call), and that exactly-at-cap passes.
- **`describe('the audit row')`** – Asserts `emitAuditEvent` is called once with `ADMIN_ORDERS_EXPORTED`, a `filter` object where `email` is the boolean `true` (not the value), and a `rowCount`; confirms no email string leaks into the audit payload.
- **`jest.mock` of the audit port** – Replaces the module with `auditPortMock()` from `tests/support/ports` (see Notes).

## Relationships

- **`src/modules/orders/services/index.ts`** – Under test; imports `orderService` and calls `openOrderExport`.
- **`src/modules/orders/audit.ts`** – Provides the `ordersAuditActions.ADMIN_ORDERS_EXPORTED` constant asserted in the audit test.
- **`src/infrastructure/observability/audit.ts`** – Mocked out; `emitAuditEvent` is observed via `observePort` to assert call shape.
- **`src/modules/orders/tests/factories.ts`** – `createOrder`, `toOrderItem` used to seed orders.
- **`src/modules/products/tests/factories.ts`** – `createProduct` for the item in each order.
- **`src/modules/users/tests/factories.ts`** – `createUser` for the buyer.
- **`src/types/index.ts`** – `OrderStatus` enum for filtering and seeding.
- **`tests/support/callers.ts`** – `asAdmin`, `asCustomer`, `callerContextAs` build the caller identity passed to the service.
- **`tests/support/environment.ts`** – `setEnvironment` toggles `NODE_ORDER_EXPORT_MAX_ROWS` per test.
- **`tests/support/ports.ts`** – `observePort` captures port calls; `auditPortMock` supplies the replacement module.
- **`tests/support/setup-test-db.ts`** – `setupTestDb` provisions the real Mongo instance the tests run against.

## Notes

- The audit port is **replaced**, not spied on. `jest.spyOn` cannot redefine the non-configurable getter exposed by a CommonJS namespace import; the full reasoning lives in `cancel.test.ts`.
- The header assertion hardcodes the 13-column string (sourced from `orders/openapi.yaml`). If the service's column constant were reordered, this test would catch it because the expected string is independent of the code.
- The formula-injection test expects a **single-quote** prefix (`'=cmd@…`), not a double-quote or backtick.
- `csvOf` is deliberately a success-only helper; use it only in paths where you expect a `Stream` back. In refusal tests, assert on the returned object directly.
- The audit `filter` records `email: true` (a presence flag), never the email value itself—this is an intentional data-minimisation choice asserted explicitly.
