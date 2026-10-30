---
source: src/modules/inventory/tests/integration/service.test.ts
sha256: e3168a905762073426b09b65625b15782885624cba667716f8ddb312eb9091ff
generated_at: 2026-10-29T04:08:27.334088+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/tests/integration/service.test.ts

## Purpose

Integration tests for the inventory service's own guarantees—exactly-once claims, admin transitions, their refusals, and the sweep—run against a real Mongo instance because every guarantee is a conditional write. Cross-module lifecycle is deferred to `cart/tests/integration/stock.test.ts`; the replay invariant to `ledger.property.test.ts`.

## Key elements

- **`describe('reserveForOrder', …)`** — the main block. Covers atomic all-or-nothing holds, rollback ledger recording, idempotency on order-id, caller-supplied vs. env-var vs. default TTL windows, non-duplicate DB error propagation, and cache-refresh failure resilience.
- **`orphanedCount(stage)`** — reads the process-wide `inventoryCommitOrphanedTotal` registry; tests assert delta rather than absolute value.
- **`anOrderId()`** — generates a syntactically valid, globally unique 24-char hex id per call.
- **`holdStatusOf(orderId)` / `levelOf(productId)`** — read helpers hitting `reservationRepository` and `stockLevelRepository` directly (the module's source of truth, not the product mirror).
- **`withoutWindow(body)`** — wraps `body` in `withEnvironmentOverrides` with `NODE_RESERVATION_TTL_MINUTES: '0'` so every hold is immediately stale. Defined at module scope to avoid leaking a zero TTL into other cases.
- **`jest.mock('@infrastructure/observability/audit', …)`** — replaces the audit port module with `auditPortMock()` from `tests/support/ports.ts`.

## Relationships

- **`src/modules/inventory/services/index.ts`** — under test; calls `inventoryService.reserveForOrder`, `listMovements`, and (in the truncated remainder) admin/sweep methods.
- **`src/modules/inventory/repository.ts`** — `reservationRepository` and `stockLevelRepository` are the data-access layer the tests read through for assertions and for mocking (`reservationModel.create`, `stockLevelRepository.findByProductId`).
- **`src/modules/inventory/model.ts`** — `reservationModel` and `stockLevelModel` are spied on to inject failures.
- **`src/modules/inventory/services/orphan-counter.ts`** — `inventoryCommitOrphanedTotal` provides the process-wide Prometheus-style counter the orphan-commit tests read.
- **`src/modules/inventory/events.ts`** — `HOLD_ORPHANED` event constant used in sweep-related assertions.
- **`src/kernel/outbox.ts`** — `outboxEventModel` for verifying outbox writes as a side-effect of inventory mutations.
- **`src/modules/inventory/audit.ts`** — `inventoryAuditActions` imported for audit-assertion helpers.
- **`src/infrastructure/observability/audit.ts`** — mocked at module level (see Notes).
- **`src/infrastructure/runtime/database.ts`** — `withTransaction` used in sweep/atomicity tests.
- **`src/modules/products/tests/factories.ts`** — `createProduct`, `readProduct`, `deleteProduct`, `countersOf` seed and read the product catalogue.
- **`src/types/index.ts`** — `StockMovementReason` enum for ledger assertions.
- **`tests/support/setup-test-db.ts`** — provisions and tears down the real Mongo instance.
- **`tests/support/environment.ts`** — `setEnvironment`, `withEnvironmentOverrides` for TTL and feature-flag control.
- **`tests/support/ports.ts`** — `auditPortMock()` and `observePort` for port-level assertions.
- **`tests/support/callers.ts`** — `testCallerContext` injected into service calls.

## Notes

- **Audit mock is a replacement, not a spy.** `jest.spyOn` cannot redefine the non-configurable getter a CommonJS namespace import exposes, so the entire module is swapped via `jest.mock`. See `tests/support/ports.ts` for the full rationale.
- **Two sources of truth for stock levels.** `levelOf` reads `stocklevels` (the ledger); `countersOf` reads the mirror `syncStockCache` writes into `products`. Tests that assert a hold succeeded check *both* to catch a cache that agrees with itself but never mirrored the real write.
- **Duplicate-key error code is 11000.** A mutation-testing note in the source: the service's `insertHold` must map *only* `code 11000` to a "already held" no-op; any other error (e.g. `code 121`) must propagate. The corresponding test injects a non-11000 rejection and asserts the error surfaces.
- **Orphaned counter is process-wide.** The registry outlives individual tests, so cases assert before/after deltas rather than an absolute total.
- **`withoutWindow` is module-scoped, not inside a `describe`.** Keeping `NODE_RESERVATION_TTL_MINUTES` at zero only for the body of the callback prevents it from expiring holds that sibling tests depend on.
