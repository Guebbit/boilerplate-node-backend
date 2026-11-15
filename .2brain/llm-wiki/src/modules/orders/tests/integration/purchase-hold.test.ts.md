---
source: src/modules/orders/tests/integration/purchase-hold.test.ts
sha256: dc067a259f15ac95d67ab8866929fcfe8798e55890c1893f0caa33bfcff4fb89
generated_at: 2026-11-14T20:53:47.825851+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/purchase-hold.test.ts

## Purpose

Integration tests for the purchase-hold feature: a time-limited pause on a buyer's checkout that activates after the buyer's own repeated order cancellations (the third within a window). Verifies the counting rules, idempotency, staff notification, staff lift reset, configurable thresholds, module event wiring, error resilience, and that bot-like causes (reservation expiry, withdrawal through returns) also feed the same counter.

## Key elements

- **`cancelOneAsBuyer` / `cancelOnePaidAsBuyer` / `withdrawOneUnpaid` / `letOneExpire`** — helper factories that create a product + order and trigger the relevant cancellation path, returning the order id.
- **`buyerCanceled` / `placedFacts` / `staffNotices` / `holdOf` / `flaggedAt`** — small query helpers that read the side-effects (domain events collected, stored hold, user flag) so assertions stay declarative.
- **`describe('considerPurchaseHold')`** — the main suite: threshold (3rd cancel), idempotent replay, buyer-only attribution, staff-caused exclusion, lift-then-recount, env-var limit override, notification payload shape, `ORDER_CANCELED` → module wiring, graceful failure (log + resolve), missing-order no-op.
- **`describe('the pause counts what bots do')`** — verifies that `reservation_expired` and `withdrawal` causes also increment the counter and that mixed causes accumulate together.
- **`jest.mock('@infrastructure/adapters/mailer')`** — replaces `enqueueEmail` with a mock so no real mail is sent; the buyer-mail `.catch` chain is stubbed via `mockResolvedValue`.

## Relationships

| Neighbor file | Interaction |
|---|---|
| `src/modules/orders/services/index.ts` | Imports `orderService`; exercises its `considerPurchaseHold`, `cancelOnRequestById`, `withdrawById`, and `expireReservationById` methods as the system under test |
| `src/modules/orders/events.ts` | Imports `ORDER_CANCELED` and `ORDER_PURCHASE_HOLD_PLACED` to drive and assert on domain events |
| `src/modules/orders/module.ts` | Imported as `ordersModule`; passed to `registerModules` in the wiring test to verify the `ORDER_CANCELED` → hold subscription |
| `src/modules/orders/repository.ts` | Imports `orderRepository`; spies on its `findById` in the failure-path test |
| `src/kernel/events.ts` | Uses `onDomainEvent` to collect `ORDER_PURCHASE_HOLD_PLACED` facts; `emitDomainEvent` / `resetDomainEvents` for the wiring test and cleanup |
| `src/kernel/registry.ts` | Calls `registerModules` to activate the orders module for the wiring test |
| `src/kernel/outbox.ts` | Calls `settleOutboxNudges` to flush pending outbox entries before asserting in the wiring test |
| `src/kernel/access/tenant.ts` | Imports `DEPLOYMENT_TENANT_ID`; asserted in the notification-payload test |
| `src/infrastructure/adapters/mailer.ts` | Fully mocked at module level; `enqueueEmail` is the integration seam for staff/buyer mail |
| `src/infrastructure/adapters/logger.ts` | Imports `logger`; spies on `logger.error` to confirm the failure path logs |
| `src/domain-primitives/time.ts` | Imports `DAY_MS` (used for window-related assertions) |
| `src/modules/users/index.ts` | Imports `userService`; calls `purchaseHoldOf` and `liftPurchaseHold` |
| `src/modules/users/repository.ts` | Imports `userRepository`; reads `findById` via the `flaggedAt` helper |
| `src/modules/orders/tests/factories.ts` | Uses `createOrder` and `toOrderItem` to build fixture orders |
| `src/modules/products/tests/factories.ts` | Uses `createProduct` to build fixture products |

## Notes

- Tests run against a real database (`setupTestDb`) — this is an integration suite, not a unit mock-heavy file.
- The `placedFacts` array is the single source of truth for "what staff were told"; it is cleared in `beforeEach` and read via `staffNotices()`.
- The module-wiring test (`is wired to order.canceled by the module`) is the only test that exercises the full event-dispatch path through `registerModules` + `settleOutboxNudges` + `emitDomainEvent`; all other tests call the service method directly.
- The failure-path test asserts that the call **resolves** (does not throw) so downstream cancel-mail and subsequent order events are not blocked — a deliberate design contract.
- `NODE_PURCHASE_HOLD_CANCEL_COUNT` env var controls the threshold (default 3); tested via `withEnvironmentOverrides`.
