---
source: src/modules/orders/tests/integration/export.test.ts
source_sha256: 769083489a665a4d35a4de625193ac4136f044498dde058792bcdd0af372d01a
context_sha256: b1fad62b05df5546db06be64568c114570097e140d2e121acb9adc7f0558de76
generated_at: 2026-11-22T06:27:56.830859+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/tests/integration/export.test.ts

## Purpose
Integration test suite (real Mongo) for the orders CSV export, exercised through the orders service's `openOrderExport`. It covers the export's filters and ordering, formula escaping, the row cap, the audit event it emits, and read-scope enforcement.

## Key elements
- **`staff`**: an admin `callerContextAs('admin', 'admin-1')` used as the actor in every export.
- **`csvOf(opened)`**: reads the result of `openOrderExport` into a string via `text(opened.source.pipe(opened.csv))`. It throws if the result has a `'success'` key (a refusal).
- **`orderOf(email, status?, createdAt?)`**: creates a user, a product priced `10.00`, and an order of 2 units for that buyer. The default status is `paid`, and `createdAt` is optional.
- **`describe('the file')`**:
  - Checks the exact header, spelled out literally from `src/modules/orders/openapi.yaml` rather than imported.
  - Checks one line per matching order, filtered by `status: 'paid'` and sorted by `createdAt`.
  - Checks that no address data appears.
  - Checks that a cell starting with `=` is prefixed with `'`.
  - Checks that a customer caller only gets their own orders.
- **`describe('the cap')`**:
  - With `NODE_ORDER_EXPORT_MAX_ROWS=1`, two orders produce a refusal: `success: false`, status 422, code `ORDER_EXPORT_TOO_LARGE`. The cap value appears in the response, and no audit event is emitted.
  - An export exactly at the cap succeeds.
- **`describe('the audit row')`**: expects exactly one `emitAuditEvent` call with action `ordersAuditActions.ADMIN_ORDERS_EXPORTED` and metadata `{ filter: { status: 'paid', email: true }, rowCount: 1 }`. The raw email must not appear anywhere in the call arguments.

## Relationships
- **`src/modules/orders/services/index.ts`**: provides `orderService`, whose `openOrderExport` is the unit under test.
- **`src/modules/orders/audit.ts`**: provides `ordersAuditActions`, used to assert the audit action name.
- **`src/infrastructure/observability/audit.ts`**: replaced in tests with `auditPortMock()` from `tests/support/ports.ts`. `observePort` then watches `emitAuditEvent`.
- **`tests/support/setup-test-db.ts`** (`setupTestDb`): provides the Mongo lifecycle.
- **`tests/support/environment.ts`** (`setEnvironment`): sets the cap variable.
- **`tests/support/callers.ts`** (`asAdmin`, `asCustomer`, `callerContextAs`): provides caller identities.
- **`tests/support/ports.ts`** (`observePort`, `auditPortMock`): provides audit port observation and the mock.
- **Factories** in `src/modules/users/tests/factories.ts`, `src/modules/products/tests/factories.ts` and `src/modules/orders/tests/factories.ts`: build the fixture data (`createUser`, `createProduct`, `createOrder`, `toOrderItem`).
- **`src/types/index.ts`**: provides `OrderStatus`.

## Notes
- The audit port is replaced rather than spied on, because `jest.spyOn` cannot redefine the non-configurable getter of a CommonJS namespace import. The file points to `cancel.test.ts` for the full reasoning.
- The cap refusal must happen before any row is read, and it must not emit an audit event.
- `afterEach` calls `jest.restoreAllMocks()`.
