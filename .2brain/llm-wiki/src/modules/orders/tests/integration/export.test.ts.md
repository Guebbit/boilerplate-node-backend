---
source: src/modules/orders/tests/integration/export.test.ts
sha256: e820647219bd81749507ceb9e6359d7cdf7a7e192bcc03fa94f173a27d44a578
generated_at: 2026-11-08T07:04:44.197474+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/export.test.ts

## Purpose
Integration test for `orderService.openOrderExport` (the orders CSV endpoint) against a real MongoDB. Verifies the CSV contract (column order, formula escaping, read scoping), the row-cap refusal path, and the audit row's content invariants.

## Key elements
- **`csvOf`** — unwraps the success result of `openOrderExport` and streams it to text via `node:stream/consumers`; throws a descriptive error if the result is a refusal.
- **`orderOf`** — composes `createUser` → `createProduct` → `createOrder` into one buyer/order pair with optional `status` and `createdAt`.
- **`staff`** — the admin caller context (`callerContextAs('admin', 'admin-1')`) passed to every export call.
- **`describe('the file')`** — asserts header column order, row count/order, absence of address fields, formula-injection escaping (leading `'`), and customer read-scope filtering.
- **`describe('the cap')`** — sets `NODE_ORDER_EXPORT_MAX_ROWS` via `setEnvironment`; verifies over-cap returns `422 / ORDER_EXPORT_TOO_LARGE` with no audit event, and at-cap passes.
- **`describe('the audit row')`** — asserts the single audit call carries `action: ADMIN_ORDERS_EXPORTED`, a boolean-masked filter, and `rowCount`, but never a raw email or row payload.
- **`jest.mock('@infrastructure/observability/audit', …)`** — replaces the audit module with `auditPortMock()` from `@tests/ports` before any import resolves.

## Relationships
| Neighbor | Interaction |
|---|---|
| `src/modules/orders/services/index.ts` | Source of `orderService.openOrderExport` under test. |
| `src/modules/orders/audit.ts` | Provides `ordersAuditActions.ADMIN_ORDERS_EXPORTED` asserted in the audit test. |
| `src/infrastructure/observability/audit.ts` | Fully replaced via `jest.mock`; its `emitAuditEvent` is the port observed with `observePort`. |
| `src/modules/orders/tests/factories.ts` | `createOrder`, `toOrderItem` used by `orderOf`. |
| `src/modules/products/tests/factories.ts` | `createProduct` used by `orderOf`. |
| `src/modules/users/tests/factories.ts` | `createUser` used by `orderOf`. |
| `src/types/index.ts` | `OrderStatus` enum values for filter/fixture setup. |
| `tests/support/callers.ts` | `asAdmin`, `asCustomer`, `callerContextAs` supply caller context. |
| `tests/support/environment.ts` | `setEnvironment` toggles `NODE_ORDER_EXPORT_MAX_ROWS` at runtime. |
| `tests/support/ports.ts` | `observePort` captures port calls; `auditPortMock` backs the `jest.mock` factory. |
| `tests/support/setup-test-db.ts` | `setupTestDb` initialises the real Mongo instance before tests run. |

## Notes
- The audit port is **replaced** (`jest.mock`), not spied on. `jest.spyOn` cannot redefine the non-configurable getter that a CommonJS namespace import exposes. The full rationale lives in `cancel.test.ts`.
- The header assertion hard-codes the entire column list to pin the OpenAPI contract; if a column is reordered in the service's constant, both the produced file and this expectation shift together, so the test still catches the swap.
- Formula-escaping test expects a **leading single-quote** (`'=cmd@…`) as the CSV injection defense; it also asserts the un-prefixed form does not appear.
- `afterEach(jest.restoreAllMocks)` covers the port mock restoration; the `jest.mock` module factory itself persists for the whole file.
