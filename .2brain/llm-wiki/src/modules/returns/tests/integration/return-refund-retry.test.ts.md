---
source: src/modules/returns/tests/integration/return-refund-retry.test.ts
sha256: f94f18b15014a134e9d3e29e7d4df88c8b8d88511318968f4da9f5ea88b6c2bc
generated_at: 2026-11-08T08:10:58.176753+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/integration/return-refund-retry.test.ts

## Purpose

Integration test that verifies the refund-retry contract when the payment provider refuses or cannot record a refund during `receiveReturn`. It proves three invariants: a failed refund does not undo the receipt (goods are still returned), a failure to even record the refund aborts the whole receipt so a second attempt can succeed, and a post-commit failure leaves a durable pending record that the payment sweep later completes. Both the `returns` and `payments` modules run as real implementations (no service-level mocks), so the actual sweep logic executes.

## Key elements

- **`withdrawnOrder()`** — async helper that builds a full pre-condition chain: creates a user, product, and order; reserves inventory; creates and confirms a payment intent; advances the order to `delivered`; and finally calls `returnService.createReturn` with reason `"withdrawal"`. Returns `{ shirt, orderId, returnId }`.
- **`describe('a return whose refund the provider refuses')`** — the single suite containing all three scenarios.
  - *Test 1: "leaves the return received…sweep completes the refund"* — Spies on `fakePaymentProvider.refund` to reject once. Asserts status stays `received`, stock is restocked, the refund record is `failed`, then calls `paymentService.retryOpenRefunds()` and waits (via `eventually`) for the return to become `closed` with a `closedAt` date.
  - *Test 2: "fails the whole receipt when the refund cannot be recorded"* — Spies on `paymentService.openReturnRefund` to throw. Asserts the return stays `approved`, stock is *not* restocked, and no refund record exists. A second `receiveReturn` call then succeeds and closes the return.
  - *Test 3: "leaves a durable record for the sweep when the work after the commit fails"* — Spies on `inventoryService.refreshStockCacheForProducts` to throw. Asserts the refund is recorded as `pending`, then the sweep closes the return.

## Relationships

- **`fakePaymentProvider`** (`scenarios/support/doubles/payments/fake.ts`) — the injected payment double; test 1 spies on its `refund` method to simulate a provider refusal.
- **`paymentService` / `paymentsModule`** (`src/modules/payments/`) — real module registered in `beforeEach`; provides `createIntent`, `confirmPayment`, `getForOrder`, `openReturnRefund`, and `retryOpenRefunds` (the sweep under test).
- **`returnService`** (`src/modules/returns/services/index.ts`) — SUT: `createReturn` and `receiveReturn`.
- **`returnRepository`** (`src/modules/returns/repository.ts`) — used to read persisted return state after each scenario.
- **`returnsModule`** (`src/modules/returns/module.ts`) — registered alongside `paymentsModule` so the real module wiring (and its dependency on `payments`) is active.
- **`inventoryService`** (`src/modules/inventory/`) — `reserveForOrder` is called during setup; `refreshStockCacheForProducts` is spied in test 3.
- **Factories** (`users`, `products`, `orders`, `delivery` test factories) — build the pre-condition entities and drive order status.
- **`resetDomainEvents`** (`src/kernel/events.ts`) — clears event bus state between tests.
- **`testCallerContext`, `callerContextAs`, `asAdmin`, `asCustomer`** (`tests/support/callers.ts`) — supply the auth/caller context expected by service calls.

## Notes

- The test registers **real** `paymentsModule` and `returnsModule` rather than mocking them; only the external provider double and two narrow service methods are spied. This is intentional — the sweep completing a refund is the behavior under test.
- `withEnvironmentOverrides({ NODE_PAYMENT_REFUND_RETRY_MINUTES: '0' })` forces the sweep to treat a refund as immediately eligible for retry, removing any real delay.
- `eventually(...)` is used wherever the sweep updates state asynchronously (after `retryOpenRefunds`), since the close is not synchronously awaited.
- Test 2's key distinction: the failure is in `openReturnRefund` *itself* (before any commit), so the entire `receiveReturn` transaction rolls back. Test 3's failure is *after* the refund record is persisted, so the pending record survives and the sweep can pick it up.
