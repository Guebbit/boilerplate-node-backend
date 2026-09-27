---
source: src/modules/inventory/tests/integration/service.test.ts
sha256: 0f415615743f538d346bc66fb8cd8d0724486bcd669a135f83f5cbc95fb270c6
generated_at: 2026-09-27T14:57:14.799918+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/tests/integration/service.test.ts

## Purpose

Integration tests for the inventory service's own module edges: exactly-once reservation claims, admin transitions (receive/adjust) and their refusals, and the reservation sweep. Cross-module lifecycle is delegated to `cart/tests/integration/stock.test.ts` and replay invariants to `ledger.property.test.ts`. All tests run against a real Mongo instance because every guarantee under test is a conditional write.

## Key elements

- **`jest.mock('@infrastructure/observability/audit', …)`** — Replaces (not spies) the audit port. The mock re-routes `recordAudit` through the replacement `emitAuditEvent` so a single spy sees both direct and indirect audit calls.
- **`setupTestDb()`** — Provisions a real Mongo database for the suite.
- **`anOrderId()`** — Returns a syntactically valid, unique 24-char hex order ID per call.
- **`levelOf(productId)`** — Reads directly from `stocklevels` (the module's source of truth), bypassing the `products` mirror that `countersOf` checks.
- **`withoutWindow(body)`** — Runs `body` with `NODE_RESERVATION_TTL_MINUTES=0` so all holds are immediately stale; scoped per-call to avoid affecting other tests.
- **`describe('reserveForOrder')`** — Covers: all-or-nothing holds, movement audit trail (reserve + release both recorded), idempotency on order ID, caller-supplied TTL vs. env-var fallback, non-duplicate DB error propagation, partial-hold rollback on mid-loop throw, and refusal when stock is fully reserved.
- **Remaining describes** (beyond the truncated portion) — Cover `commitForOrder`, `releaseForOrder`, `receive`, `adjust`, `runReservationSweep`, `listLevels`, `lowStockCount`, and `listMovements`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/inventory/service.ts` | SUT — all exported functions under test are imported here. |
| `src/modules/inventory/repository.ts` | `reservationRepository` and `stockLevelRepository` used for direct-state assertions and for spying (`applyDelta`, `findByOrderId`). |
| `src/modules/inventory/model.ts` | `reservationModel.create` spied to simulate non-duplicate DB failures. |
| `src/modules/inventory/audit.ts` | `inventoryAuditActions` imported for audit-action assertions. |
| `src/infrastructure/observability/audit.ts` | Fully mocked via `jest.mock`; `emitAuditEvent` replaced with a `jest.fn()` for call-count/shape assertions. |
| `src/modules/products/tests/factories.ts` | `createProduct`, `readProduct`, `deleteProduct`, `countersOf` provide product fixtures and mirror-cache reads. |
| `src/types/index.ts` | `StockMovementReason` enum used in expected movement rows. |
| `tests/support/environment.ts` | `withEnvironment` temporarily overrides env vars (e.g. TTL) for individual tests. |
| `tests/support/ports.ts` | `observePort` imported (referenced in the mock-replacement rationale comment). |
| `tests/support/setup-test-db.ts` | `setupTestDb` initialises the real Mongo connection before the suite. |

## Notes

- **Audit mock is a replacement, not a spy.** `jest.spyOn` cannot override the non-configurable getter that a CommonJS namespace import exposes; the full reasoning lives in `tests/support/ports.ts`. The `recordAudit` override inside the mock exists because that function closes over its own module's `emitAuditEvent` and would bypass the top-level replacement.
- **Two sources of truth, two readers.** `countersOf` (from products factories) reads the `products` mirror written by `syncStockCache`; `levelOf` reads `stocklevels` directly. Assertions that need the "real" row use `levelOf`; those checking the mirror use `countersOf`. Both are asserted in idempotency tests to catch a cache that agrees with itself while diverging from the write.
- **`withoutWindow` is module-scoped, not describe-scoped.** Setting TTL to zero inside a `describe` would leak into sibling tests that depend on live holds.
- **Mutation-testing annotations.** Inline comments (e.g. the `code: 121` propagation test, the B15 partial-hold test) document specific mutants that survived prior test suites and the regression each test now pins.
- **Order IDs are hex-padded to 24 chars** to satisfy any string-length constraint Mongo or the application may impose, while remaining unique via an incrementing counter.
