---
source: src/modules/orders/tests/integration/export.test.ts
sha256: 12b6dc1e414e658a0525d0cb5416f48dfaec2203ac247d559a447b65b9e6527b
generated_at: 2026-10-15T11:14:22.344674+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/export.test.ts

## Purpose

Integration tests for `orderService.openOrderExport`, exercising the full CSV export path against a real MongoDB instance. Covers column ordering and content, formula-injection escaping, read-scope enforcement, the row-count cap, and audit-row invariants (filter + count recorded, no PII or row data leaked).

## Key elements

- **`csvOf`** — Helper that consumes the export stream and returns the CSV text; throws if the export was refused (use the raw return value for cap tests instead).
- **`orderOf`** — Creates a user, a product, and a single-item order, returning the order. Accepts optional status and `createdAt`.
- **`staff`** — The admin caller-context used as the `actor` argument in every export call.
- **`jest.mock('@infrastructure/observability/audit', …)`** — Replaces the audit port module: `emitAuditEvent` becomes a `jest.fn()`, and `recordAudit` is re-implemented to call `buildAuditEvent` then forward to that spy.
- **`describe('the file')`** — Verifies header matches `ORDER_CSV_COLUMNS`, row order follows the list sort, no address fields appear, `=…` cells are quote-prefixed, and customer-scoped callers only see their own rows.
- **`describe('the cap')`** — Sets `NODE_ORDER_EXPORT_MAX_ROWS` via `setEnvironment`; asserts a 422 / `ORDER_EXPORT_TOO_LARGE` refusal (with the cap number in the message) and zero audit calls when over, and a successful two-line file when exactly at the cap.
- **`describe('the audit row')`** — Asserts one `emitAuditEvent` call with action `ordersAuditActions.ADMIN_ORDERS_EXPORTED`, metadata containing `filter` (boolean flags, not raw values) and `rowCount`, and confirms no email string appears in the serialized call.

## Relationships

- **`src/modules/orders/services/index.ts`** — Source of `orderService`, the system under test.
- **`src/modules/orders/domain/index.ts`** — Re-exports `ORDER_CSV_COLUMNS` (from `domain/export.ts`) used to assert the CSV header.
- **`src/modules/orders/audit.ts`** — Provides `ordersAuditActions.ADMIN_ORDERS_EXPORTED` expected in the audit assertion.
- **`src/infrastructure/observability/audit.ts`** — The audit port being replaced; its `emitAuditEvent`, `recordAudit`, and `buildAuditEvent` are exercised.
- **`src/modules/orders/tests/factories.ts`** — `createOrder`, `toOrderItem` for building fixtures.
- **`src/modules/products/tests/factories.ts`** — `createProduct` for the order line-item product.
- **`src/modules/users/tests/factories.ts`** — `createUser` for the buyer.
- **`src/types/index.ts`** — `OrderStatus` enum used in fixtures and assertions.
- **`tests/support/callers.ts`** — `asAdmin`, `asCustomer`, `callerContextAs` for request contexts.
- **`tests/support/environment.ts`** — `setEnvironment` to override `NODE_ORDER_EXPORT_MAX_ROWS`.
- **`tests/support/ports.ts`** — `observePort` to capture audit calls.
- **`tests/support/setup-test-db.ts`** — Initialises the real MongoDB for the suite.

## Notes

- The audit port is **replaced**, not spied on. The comment (echoed from `cancel.test.ts`) explains that `jest.spyOn` cannot redefine the non-configurable getter a CommonJS namespace import exposes, so the module is fully mocked with a hand-written `recordAudit` that delegates to `buildAuditEvent`.
- `afterEach` calls `jest.restoreAllMocks()`, which resets the `emitAuditEvent` spy between tests.
- The cap tests use `setEnvironment` (not process.env directly) to set `NODE_ORDER_EXPORT_MAX_ROWS`; remember this resets on next call.
- The "formula escaping" test expects a single-quote prefix (`'=cmd@…`) rather than double-quoting, matching the domain's escaping strategy.
