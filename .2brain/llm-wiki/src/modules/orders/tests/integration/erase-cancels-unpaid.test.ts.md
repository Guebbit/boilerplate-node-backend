---
source: src/modules/orders/tests/integration/erase-cancels-unpaid.test.ts
sha256: 32a632c677bfd056ed8a1b6b252df28c5677db78ab065c8bd113a422a7cbf560
generated_at: 2026-11-08T07:04:28.633770+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/erase-cancels-unpaid.test.ts

## Purpose

Integration test verifying that a **hard** erasure of a user account cancels all of their never-paid orders (releasing the inventory reservation through the reservation-sweep path) while leaving paid orders intact as detached invoices. It drives the flow through `userService.remove` with real module wiring so a missing hook registration in the orders module would be caught.

## Key elements

- **`heldOrderFor(user, quantity)`** – Local helper that creates a product, a pending order, and a real `inventoryService.reserveForOrder` call, asserting the hold succeeded. Returns `{ order, product }` for subsequent assertions.
- **`describe('orders — erasing an account cancels its never-paid orders')`** – The test suite. Individual `it` blocks cover:
  - Order status becomes `canceled`; stock counters reset (`reserved → 0`).
  - Stock ledger records both `reserve` and `release` movements for the order reference.
  - PII detachment: `userId` cleared, `piiClockStartedAt` set.
  - Multiple unpaid orders all canceled.
  - No email is enqueued to the erased address (mailer mock).
  - Analytics emits `ORDER_CANCELED`, **not** `ORDER_RESERVATION_EXPIRED`.
  - A `paid` order remains `paid`, only detached.
  - An already-`canceled` order is left unchanged.
  - Another account's pending order is untouched.
  - A **soft** delete (`removeById` with `hardDelete: false`) does *not* cancel the order.
- **`jest.mock('@infrastructure/adapters/mailer')`** – Replaces `enqueueEmail` with a mock so the test can assert zero calls.
- **`jest.mock('@infrastructure/observability/analytics')`** – Replaces `emitAnalyticsEvent` (replaced, not spied on — see `tests/support/ports.ts` rationale).
- **`beforeEach`** – Clears the mailer mock and calls `registerCheckoutModules()` to wire the real module graph.
- **`afterEach`** – Calls `resetDomainEvents()` to isolate event-bus state between tests.

## Relationships

| Neighbor | Interaction |
|---|---|
| `@modules/users` (`userService`) | Entry point: `eraseAsScheduled` / `removeById` trigger the erasure flow. |
| `@modules/users/tests/factories` | `createUser`, `eraseAsScheduled` for fixture setup and the erasure call. |
| `@modules/products/tests/factories` | `createProduct`, `countersOf` for stock-level assertions. |
| `@modules/orders/tests/factories` | `createOrder`, `toOrderItem`, `markOrderPaidAt`, `readOrder`, `forceOrderStatus`. |
| `@modules/inventory` (`inventoryService`) | `reserveForOrder` to establish the hold; `listMovements` to inspect the ledger. |
| `@modules/orders/analytics` | `ordersAnalyticsEvents` enum for expected event names. |
| `@infrastructure/adapters/mailer` | Mocked; assertion target for "no email sent." |
| `@infrastructure/observability/analytics` | Mocked; observed via `observePort` for event-name assertions. |
| `@kernel/events` | `resetDomainEvents` in `afterEach` for isolation. |
| `@types` | `OrderStatus`, `StockMovementReason` enum values. |
| `tests/support/checkout-modules` | `registerCheckoutModules` wires the full module graph per test. |
| `tests/support/callers` | `callerContextAs` for the soft-delete call. |
| `tests/support/ports` | `observePort` helper for analytics spy. |

## Notes

- The test deliberately calls `userService.remove` (the public service) rather than the internal erasure hook, so a broken hook registration in `orders/module.ts` would fail the test. A direct hook call would hide that regression.
- The mailer mock asserts on the **queue** (no `enqueueEmail` call), not on a sent copy — the point is that the erased address is never reached.
- Analytics is **replaced** (full mock) rather than spied, following the convention documented in `tests/support/ports.ts`; this avoids partial real-side-effects during the test.
- `eraseAsScheduled` performs a hard delete; the soft-delete case is a separate test using `removeById(…, false, …)` to confirm orders survive.
