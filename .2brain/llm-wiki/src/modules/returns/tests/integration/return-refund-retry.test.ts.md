---
source: src/modules/returns/tests/integration/return-refund-retry.test.ts
sha256: 28cd1683e8636798f7eb49000774deb5b093bcab497ef8d8cc33ac6f5d9a0015
generated_at: 2026-10-29T05:49:14.915908+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/integration/return-refund-retry.test.ts

## Purpose

Integration test that verifies the refund-retry path in the returns module: when a payment provider refuses a refund, the goods are still received, the refund stays open on the payment, and the **real** payment sweep (`retryOpenRefunds`) is what ultimately completes the refund and closes the return. It also covers two failure modes where the receipt itself fails and a retry must succeed.

## Key elements

- **`withdrawnOrder`** – Local helper that builds a fully paid, delivered order (user → product → order → inventory reservation → payment intent → confirm → delivery) and creates a withdrawal return on it. Returns `{ shirt, orderId, returnId }` for assertions.
- **Test 1 – "leaves the return received, and closes it when the sweep completes the refund"** – Mocks `fakePaymentProvider.refund` to reject once. Asserts the return is `received`, stock is restocked, the refund is `failed`, then calls `paymentService.retryOpenRefunds()` and polls until the return is `closed` with a `closedAt` date and the payment is `succeeded`.
- **Test 2 – "fails the whole receipt when the refund cannot be recorded"** – Mocks `paymentService.openReturnRefund` to reject. Asserts the receipt throws, nothing is committed (status stays `approved`, stock unchanged, no refund on file), and a second `receiveReturn` call succeeds and closes the return immediately.
- **Test 3 – "leaves a durable record for the sweep when the work after the commit fails"** – Mocks `inventoryService.refreshStockCacheForProducts` to reject. Asserts the receipt throws, but the refund is already persisted as `pending`, and the sweep later closes the return.

## Relationships

- **`scenarios/support/doubles/payments/fake.ts`** – `fakePaymentProvider` is spied on to inject a one-time refund rejection (test 1).
- **`src/modules/payments/module.ts` / `services/index.ts`** – `paymentsModule` is registered for the test; `paymentService` is used for real intent/confirm flow, `getForOrder` assertions, `openReturnRefund` spy (test 2), and `retryOpenRefunds` (the actual sweep under test).
- **`src/modules/returns/module.ts` / `services/index.ts` / `repository.ts`** – `returnsModule` is registered; `returnService.createReturn` / `receiveReturn` are the system under test; `returnRepository.findById` is used to read persisted state.
- **`src/modules/inventory/index.ts`** – `inventoryService.reserveForOrder` sets up stock; `refreshStockCacheForProducts` is spied on in test 3.
- **`src/kernel/events.ts`** – `resetDomainEvents` runs in `afterEach` to clear the in-memory event log between tests.
- **Factories (`users`, `products`, `orders`, `delivery`)** – Used in `withdrawnOrder` to build the domain fixtures.
- **`tests/support/callers.ts`** – `asAdmin`, `asCustomer`, `testCallerContext`, `callerContextAs` supply the caller context for service calls.

## Notes

- `NODE_PAYMENT_REFUND_RETRY_MINUTES` is overridden to `'0'` (via `withEnvironmentOverrides`) in tests 1 and 3 so the sweep's scheduling gate passes immediately; test 2 does not need it because it exercises the receipt path, not the sweep.
- The payment sweep is exercised **for real** (no double) — the module docblock explicitly states that `returns` depends on `payments`, so the real sweep is the correct way to verify the close.
- Failure injection points differ per test: provider-level (`fakePaymentProvider.refund`) vs. service-level (`paymentService.openReturnRefund`) vs. post-commit side-effect (`inventoryService.refreshStockCacheForProducts`). This distinguishes "refund declined by provider" from "refund not yet recorded" from "receipt committed but post-commit work crashed."
- `eventually` is used to poll for the async state change (return → `closed`) rather than asserting it synchronously after the sweep call.
