---
source: src/modules/inventory/tests/integration/service.test.ts
sha256: d7dad28f04138e3335e1b8cae0c23d065fd1cf69f3321f5052b6fe9a195c7a4c
generated_at: 2026-11-08T06:07:49.671609+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/tests/integration/service.test.ts

## Purpose
Integration tests for the inventory service's own module-level guarantees: exactly-once reservation holds, admin transition refusals, and the orphan sweep. Cross-module lifecycle lives in `cart/tests/integration/stock.test.ts` and the replay invariant in `ledger.property.test.ts`, so this file focuses on what the inventory module itself must hold. All tests run against a real MongoDB instance because every guarantee under test is a conditional write.

## Key elements

- **`describe('reserveForOrder')`** — the visible test suite, covering:
  - All-or-nothing hold (partial shortfall → nothing held)
  - Rollback is *recorded* as a `release` movement, not netted away (ledger reconcilability)
  - Idempotency on `orderId` (retry returns the original expiry; stock decremented once)
  - Caller-supplied TTL window overrides `NODE_RESERVATION_TTL_MINUTES`
  - Fallback to the env-var TTL, and the 15-minute card-checkout default when neither is set
  - Non-duplicate DB errors (e.g. code 121) propagate; only Mongo 11000 is treated as "already held"
  - A failed `findByProductId` during the post-hold cache refresh does not undo the hold
- **`orphanedCount(stage)`** — reads the process-wide `inventoryCommitOrphanedTotal` registry for a given stage (`commit` | `ship`); used before/after comparisons because the registry outlives individual tests.
- **`anOrderId()`** — generates a unique, syntactically valid 24-char hex order ID per call.
- **`holdStatusOf(orderId)` / `levelOf(productId)`** — read helpers hitting `reservationRepository` and `stockLevelRepository` directly (the latter is the module's source of truth, not the `products` mirror that `countersOf` reads).
- **`withoutWindow(body)`** — runs `body` with `NODE_RESERVATION_TTL_MINUTES: '0'` so every hold opened inside is immediately stale. Scoped at module level to avoid leaking TTL=0 into other cases.
- **`jest.mock('@infrastructure/observability/audit', …)`** — replaces the audit port wholesale via `auditPortMock()` from `tests/support/ports.ts`.

## Relationships

- **`src/modules/inventory/services/index.ts`** — imports `inventoryService`, the system under test.
- **`src/modules/inventory/repository.ts`** — imports `reservationRepository` and `stockLevelRepository` for direct state assertions.
- **`src/modules/inventory/model.ts`** — imports `reservationModel` (spied on to simulate a connection-reset error) and `stockLevelModel`.
- **`src/modules/inventory/audit.ts`** — imports `inventoryAuditActions` (used in assertions, visible in truncated portion).
- **`src/modules/inventory/events.ts`** — imports `HOLD_ORPHANED` event type.
- **`src/modules/inventory/services/orphan-counter.ts`** — imports `inventoryCommitOrphanedTotal` for the orphaned-commit counter helper.
- **`src/kernel/outbox.ts`** — imports `outboxEventModel` (presumably for asserting outbox side-effects in the sweep/transition tests in the truncated portion).
- **`src/infrastructure/observability/audit.ts`** — mocked out at module load; the real implementation is never exercised here.
- **`src/infrastructure/runtime/database.ts`** — imports `withTransaction` (used in the service's internal path, asserted via effects).
- **`src/types/index.ts`** — imports `StockMovementReason` for movement-row assertions.
- **`src/modules/products/tests/factories.ts`** — imports `createProduct`, `readProduct`, `deleteProduct`, `countersOf` for test fixture setup and the `products`-side stock mirror.
- **`tests/support/callers.ts`** — imports `testCallerContext` for caller-scoped audit assertions.
- **`tests/support/environment.ts`** — imports `setEnvironment`, `withEnvironmentOverrides` to control `NODE_RESERVATION_TTL_MINUTES` per test.
- **`tests/support/ports.ts`** — imports `observePort` and supplies `auditPortMock()` used in the `jest.mock` factory.
- **`tests/support/setup-test-db.ts`** — imports `setupTestDb` to provision a real Mongo instance before any test runs.

## Notes

- **Audit port is replaced, not spied.** `jest.spyOn` cannot redefine the non-configurable getter a CommonJS namespace import exposes; the mock factory in `ports.ts` documents the full reasoning.
- **`orphanedCount` is a delta helper.** The counter registry is process-wide and survives across tests, so every assertion reads before-and-after rather than expecting an absolute value.
- **`levelOf` vs `countersOf`.** `levelOf` reads `stocklevels` (inventory's own row); `countersOf` reads the `products`-side mirror written by `syncStockCache`. The tests deliberately assert both to prove the mirror caught up, but treat `stocklevels` as the ground truth.
- **`withoutWindow` lives at module scope** (outside any `describe`) so a zero TTL never leaks into cases that depend on live holds.
- **Mutation-testing origin.** The non-duplicate-error test exists because replacing the `code === 11000` guard with `true` survived every other test — a swallowed non-11000 error would report a hold while holding nothing.
- **The file is truncated** in the provided content; the sweep and admin-transition suites referenced in the module docstring are in the omitted tail.
