---
source: src/modules/inventory/tests/integration/service.test.ts
source_sha256: 8fb0ec90bfe148ce157a3fe46f101435c753304e28700a5b79abfec04bba1cb8
context_sha256: ef963da79c93307285ce1ba95fd6057af2051b40c736a7b74e1a8413e14c6fb2
generated_at: 2026-11-22T05:28:02.907690+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/inventory/tests/integration/service.test.ts

## Purpose
Integration tests for the inventory service's own edges, run against a real MongoDB because every guarantee is a conditional write. The module header says cross-module lifecycle is covered in `src/modules/cart/tests/integration/stock.test.ts` and the replay invariant in `ledger.property.test.ts`. This file covers the exactly-once claims, the two admin transitions and their refusals, and the sweep.

## Key elements
- **`jest.mock('@infrastructure/observability/audit', …)`**: replaces the audit port with `auditPortMock()` from `@tests/ports`. It is replaced rather than spied on, because `jest.spyOn` cannot redefine the non-configurable getter a CommonJS namespace import exposes.
- **`setupTestDb()`** and an `afterEach(() => jest.restoreAllMocks())`.
- **`orphanedCount(stage)`**: reads `inventoryCommitOrphanedTotal` for the `'commit'` or `'ship'` label. The registry is process-wide, so tests compare readings taken before and after.
- **`overdueHolds()`**: reads the `inventory_overdue_holds` gauge from `metricsRegistry`. The gauge is computed on `get`.
- **`anOrderId()`**: returns a unique 24-character hex-style order id, padded with `'b'`.
- **`holdStatusOf(orderId)`**: returns the status of an order's hold, or `undefined`.
- **`levelOf(productId)`**: reads `onHand` and `reserved` through `stockLevelRepository`.
- **`withoutWindow(body)`**: runs `body` with `NODE_RESERVATION_TTL_MINUTES=0`, so any hold it opens is already stale. It is scoped per call because a file-wide zero TTL would expire the holds the other cases need.
- **`describe('reserveForOrder')`** (the visible cases):
  - All-or-nothing holding: shortfalls are reported and counters are unchanged.
  - A rolled-back reserve is recorded as `release` then `reserve` movements, not netted to nothing.
  - Idempotency on the order id: a retry reports the first call's expiry and reserves once.
  - TTL precedence: a caller-given window, then `NODE_RESERVATION_TTL_MINUTES`, then a 15-minute default.
  - A non-duplicate DB error (not Mongo code 11000) propagates instead of being reported as a hold. This case was surfaced by mutation testing.
  - If a later line throws, the service gives back only what it took and does not touch another order's hold.

## Relationships
- Drives `inventoryService` (`../../services`) and inspects state through `reservationRepository` and `stockLevelRepository` (`../../repository`).
- Imports `reservationModel` and `stockLevelModel` from `../../model`. Imports `inventoryAuditActions` from `../../audit`, `HOLD_ORPHANED` from `../../events`, and `outboxEventModel` from `@kernel/outbox`, for the audit, event and outbox assertions that come later in the file.
- Metrics: imports `../../metrics` for its side effects, which register the gauge. Reads `inventoryCommitOrphanedTotal` (`services/orphan-counter`) and `metricsRegistry`.
- `@infrastructure/observability/audit` is mocked, and `withTransaction` from `@infrastructure/runtime/database` is imported.
- `@modules/products/tests/factories` supplies `createProduct`, `readProduct`, `deleteProduct` and `countersOf`.
- `StockMovementReason` comes from `@types`. Test support comes from `@tests/setup-test-db`, `@tests/environment`, `@tests/ports`, `@tests/callers`, and `@tests/http` (`api`, `authenticateAs`).

## Notes
- Environment overrides go through `withEnvironmentOverrides`. Passing `undefined` for `NODE_RESERVATION_TTL_MINUTES` tests the shipped default.
- Expiry assertions allow ±5 seconds.
- The metrics registry is shared across tests, so counter assertions are deltas.
