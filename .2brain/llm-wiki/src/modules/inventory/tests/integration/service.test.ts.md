---
source: src/modules/inventory/tests/integration/service.test.ts
sha256: a6f06b516bf3482935eb4496cace101c052ba257007cab75a140a0fd09d840b3
generated_at: 2026-10-14T16:04:06.002132+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/tests/integration/service.test.ts

## Purpose

Integration tests for the inventory module's own service edges: exactly-once reservation claims, the two admin transitions (receive/adjust) and their refusals, and the reservation sweep. Runs against real Mongo (via `setupTestDb`) because every guarantee under test is a conditional write. Cross-module lifecycle (cart→inventory) is deliberately excluded here and lives in `cart/tests/integration/stock.test.ts`.

## Key elements

- **`jest.mock('@infrastructure/observability/audit', …)`** — Replaces the audit port entirely (not a spy) because `jest.spyOn` cannot redefine the non-configurable getter a CommonJS namespace import exposes. Also manually reroutes `recordAudit` through the mock's `emitAuditEvent` since `recordAudit` closes over its own module's real reference.
- **`setupTestDb()`** — Boots a real Mongo instance for the entire file.
- **`anOrderId()`** — Generates a syntactically valid, unique 24-char hex order ID per call.
- **`levelOf(productId)`** — Reads `stocklevels` directly (the module's source of truth), distinct from `countersOf` which reads the product mirror.
- **`withoutWindow(body)`** — Runs `body` with `NODE_RESERVATION_TTL_MINUTES=0` so all holds are immediately stale; defined at module scope to avoid leaking into other tests.
- **`describe('reserveForOrder', …)`** — Covers all-or-nothing holds, rollback movement recording, idempotency on order ID, caller-given TTL, env-var fallback TTL, default 15-min hold, non-duplicate error propagation, and partial rollback on mid-loop throw. (File continues with admin-transition and sweep tests after truncation.)

## Relationships

- **`src/modules/inventory/services/index.ts`** — Barrel import supplying every function under test (`reserveForOrder`, `commitForOrder`, `shipForOrder`, `runReservationSweep`, `receive`, `adjust`, `listLevels`, `lowStockCount`, `listMovements`, etc.).
- **`src/modules/inventory/repository.ts`** — `reservationRepository` and `stockLevelRepository` are spied on directly (e.g., `applyDelta`) to simulate mid-loop failures; `findByOrderId` is used to inspect hold expiry.
- **`src/modules/inventory/model.ts`** — `reservationModel` and `stockLevelModel` are spied on to inject specific database errors (e.g., code 121).
- **`src/infrastructure/observability/audit.ts`** — Fully mocked at the module level; the mock preserves `buildAuditEvent` from the real module while replacing `emitAuditEvent` and `recordAudit`.
- **`src/modules/inventory/audit.ts`** — `inventoryAuditActions` is imported for reference in assertions.
- **`src/infrastructure/runtime/database.ts`** — `withTransaction` is imported (used in tests that verify transactional boundaries).
- **`src/products/tests/factories.ts`** — `createProduct`, `readProduct`, `deleteProduct`, `countersOf` seed and assert on product/stock state.
- **`src/types/index.ts`** — `StockMovementReason` enum values are used in movement assertions.
- **`tests/support/environment.ts`** — `withEnvironment`, `withoutEnvironment`, `setEnvironment` control `NODE_RESERVATION_TTL_MINUTES` per test.

## Notes

- The file header explicitly carves out scope: cross-module lifecycle → `cart/tests/integration/stock.test.ts`; replay invariant → `ledger.property.test.ts`. Don't add those assertions here.
- The `jest.mock` for the audit port is a **replacement**, not a spy. `jest.spyOn` would silently no-op on the CJS getter. The manual `recordAudit` re-wiring is necessary because that function captured its own module's `emitAuditEvent` at closure time.
- A mutation-testing comment documents why only error code `11000` (duplicate key) may be swallowed into `null` inside `reserveForOrder`; any other code must propagate. The corresponding test injects code `121` to verify this.
- `withoutWindow` is intentionally a free function at module scope rather than a `beforeEach` inside a `describe`, so the zero-TTL setting doesn't expire holds that other tests in the same file depend on.
