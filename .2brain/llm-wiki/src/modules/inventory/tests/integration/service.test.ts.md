---
source: src/modules/inventory/tests/integration/service.test.ts
sha256: 0a62f94ed9c3ab6040435af62039a200463434286bb71ac64bd6a25083995b6a
generated_at: 2026-11-14T20:09:58.808292+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/tests/integration/service.test.ts

## Purpose

Integration tests for the inventory service's own contractual edges: exactly-once reservation claims, admin stock transitions (and their refusals), and the orphan sweep. Cross-module lifecycle is delegated to `cart/tests/integration/stock.test.ts` and the replay invariant to `ledger.property.test.ts`. All tests run against a real Mongo instance because every guarantee under test is a conditional write.

## Key elements

- **`describe('reserveForOrder')`** — the main test block. Covers:
  - All-or-nothing atomic hold (all lines succeed or none are written).
  - Rollback recorded as a distinct `release` movement, not netted to zero.
  - Idempotency: a retried order id holds once and returns the *first* call's expiry.
  - Caller-supplied TTL overrides `NODE_RESERVATION_TTL_MINUTES`; fallback to env; 15-minute default for card checkouts.
  - Non-duplicate DB errors propagate (code ≠ 11000 must not be swallowed as "already held").
  - A failed cache-read after the stock write does not undo the hold.
- **`orphanedCount(stage)`** — reads the process-wide orphaned-commit counter for a given stage (`'commit'` or `'ship'`); used for before/after assertions since the registry outlives individual tests.
- **`anOrderId()`** — generates a syntactically valid, unique 24-hex-char order id per call.
- **`holdStatusOf(orderId)`** — looks up a reservation's status via the reservation repository.
- **`levelOf(productId)`** — reads `stocklevels` (the source of truth) directly, distinct from the products-factory `countersOf` which reads the cache mirror.
- **`withoutWindow(body)`** — wraps a test body with `NODE_RESERVATION_TTL_MINUTES=0` so every hold is immediately stale.
- **Module-level `jest.mock` for the audit port** — replaces the audit port with `auditPortMock()` from `tests/support/ports.ts` (not a spy, because CJS namespace getters are non-configurable).

## Relationships

- `src/modules/inventory/services/index.ts` — primary system under test; `inventoryService` is exercised for every scenario.
- `src/modules/inventory/repository.ts` — `reservationRepository` and `stockLevelRepository` are spied on or queried directly to verify committed state.
- `src/modules/inventory/model.ts` — `reservationModel` and `stockLevelModel` are spied on to simulate specific failure modes (duplicate-key vs. connection-reset errors).
- `src/modules/inventory/services/orphan-counter.ts` — `inventoryCommitOrphanedTotal` is read to assert the orphan sweep's effect.
- `src/modules/inventory/audit.ts` — `inventoryAuditActions` imported for audit-log assertions.
- `src/modules/inventory/events.ts` — `HOLD_ORPHANED` imported for event-type checks.
- `src/kernel/outbox.ts` — `outboxEventModel` imported to inspect published events.
- `src/infrastructure/observability/audit.ts` — fully replaced via module-level mock; the real module never executes.
- `src/infrastructure/runtime/database.ts` — `withTransaction` imported for transactional-context tests.
- `src/modules/products/tests/factories.ts` — `createProduct`, `countersOf`, etc. provide fixture products and cache-mirror reads.
- `src/types/index.ts` — `StockMovementReason` used to assert movement row reasons.
- `tests/support/environment.ts` — `setEnvironment` / `withEnvironmentOverrides` scope TTL configuration per test.
- `tests/support/ports.ts` — supplies `auditPortMock()` used by the module-level mock factory.
- `tests/support/callers.ts` — `testCallerContext` provides caller identity for authenticated calls.
- `tests/support/http.ts` — `api` / `authenticateAs` for HTTP-level assertions where the test exercises the API surface.

## Notes

- The audit port is **replaced**, not spied on: `jest.spyOn` cannot redefine the non-configurable getter exposed by a CommonJS `import * as` namespace. The mock factory delegates to `auditPortMock()` in `tests/support/ports.ts`.
- `withoutWindow` is deliberately defined at module scope (not inside a `describe`) so that setting `NODE_RESERVATION_TTL_MINUTES=0` doesn't leak into tests that depend on a live TTL.
- The orphaned-commit counter is **process-wide** and persists across tests; assertions therefore capture a before/after delta rather than expecting an absolute value.
- `levelOf` reads `stocklevels` directly, while `countersOf` (from the products factories) reads the `syncStockCache` mirror on `products`. The file uses both deliberately to ensure the cache refresh actually mirrored the real write.
- A mutation-testing comment documents that only Mongo duplicate-key code `11000` may be swallowed as "already held"; any other error must propagate.
