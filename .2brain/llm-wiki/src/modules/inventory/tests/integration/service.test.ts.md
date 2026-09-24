---
source: src/modules/inventory/tests/integration/service.test.ts
sha256: acd2f69a0fc441bb5d7f77a2610d9e56c746067bf2750fff0fbcddfb05fd24cf
generated_at: 2026-09-23T18:47:14.221794+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/tests/integration/service.test.ts

## Purpose

Integration tests for the inventory module's own service guarantees: exactly-once reservation claims, atomic all-or-nothing holds, the two admin transitions (commit, release) and their refusal paths, the reservation sweep, and receive/adjust. Cross-module lifecycle (cart → stock) and replay invariants are covered elsewhere; this file uses real MongoDB because every guarantee under test is a conditional write.

## Key elements

- **`jest.mock('@infrastructure/observability/audit', …)`** — Replaces (not spies on) the audit port. `recordAudit` is re-wired to call the mock `emitAuditEvent` because the real closure would bypass the spy.
- **`setupTestDb()`** — Spins up a real Mongo instance for the whole suite (imported from `tests/support/setup-test-db`).
- **`anOrderId()`** — Module-scoped counter producing syntactically valid 24-char hex order IDs; guarantees uniqueness per call.
- **`countersOf(productId)`** — Reads the product mirror (`productService.findByIdRaw`) to assert `onHand`/`reserved`.
- **`levelOf(productId)`** — Reads `stockLevelRepository.findByProductId` directly; the source-of-truth row that `syncStockCache` mirrors into products.
- **`withoutWindow(body)`** — Runs `body` with `NODE_RESERVATION_TTL_MINUTES=0` so every hold is already stale; defined at module scope to avoid leaking the zero TTL into other cases.
- **`describe('reserveForOrder')`** — Covers: all-or-nothing holds, rollback movement rows, idempotency on retry, caller-given TTL vs. env-var fallback, propagation of non-11000 DB errors (mutation-testing guard), and refusal when units exist but are all held.
- **`describe('commitForOrder')`** — Covers: normal commit drops both counters, at-most-once (second call is a no-op, no alarm), committing a released hold (refused + `ADMIN_COMMIT_ORPHANED` audit), committing a never-held order (refused + alarm).
- **Additional describes (truncated)** — `releaseForOrder`, `runReservationSweep`, `receive`, `adjust`, `listLevels`, `lowStockCount`, `listMovements`.

## Relationships

- **`src/modules/inventory/service.ts`** — Primary subject; every exported service function is exercised here.
- **`src/modules/inventory/repository.ts`** — `reservationRepository` and `stockLevelRepository` are used directly for post-condition assertions (e.g., reading the hold's `expiresAt`).
- **`src/modules/inventory/model.ts`** — `reservationModel.create` is mocked in the non-duplicate-error test.
- **`src/modules/inventory/audit.ts`** — `inventoryAuditActions` constants used to assert audit payloads.
- **`src/infrastructure/observability/audit.ts`** — Mocked at module level; `emitAuditEvent` is the spy target, `recordAudit` is re-routed through it.
- **`src/modules/products/service.ts` / `src/modules/products/index.ts`** — `productService.findByIdRaw` and `createProduct` factory used to seed and read product state.
- **`src/modules/products/tests/factories.ts`** — `createProduct`, `readProduct`, `deleteProduct` helpers.
- **`src/types/index.ts`** — `StockMovementReason` enum used in movement assertions.
- **`tests/support/setup-test-db.ts`** — Real Mongo lifecycle for the suite.
- **`tests/support/environment.ts`** — `withEnvironment` overrides `NODE_RESERVATION_TTL_MINUTES` per test.
- **`tests/support/ports.ts`** — `observePort` helper that wraps the mock `emitAuditEvent` into a spy-friendly reference.

## Notes

- The audit mock **replaces** the module rather than using `jest.spyOn`, because a CommonJS namespace import exposes a non-configurable getter that `spyOn` cannot redefine. The `recordAudit` shim is necessary because the real function closes over its own `emitAuditEvent` reference.
- `countersOf` reads the **products mirror**, while `levelOf` reads **stocklevels** (the actual inventory row). Tests that verify the idempotent-hold path assert both, since a cache agreeing with itself is not proof the underlying write landed.
- The non-duplicate-error test exists because a mutation (replacing the `code === 11000` check with `true`) would silently swallow _any_ DB error as "already held," causing an order to ship with no stock. Only MongoDB duplicate-key (11000) may be mapped to a no-op.
- `withoutWindow` is intentionally at module scope (not inside a `describe`) so the zero TTL does not leak into unrelated tests in the file.
- `afterEach(() => jest.restoreAllMocks())` is the cleanup mechanism; individual tests that call `jest.spyOn` directly (e.g., the error-propagation test) also call `mockRestore()` inline.
