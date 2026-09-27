---
source: src/modules/payments/tests/unit/refunds.test.ts
sha256: ed42832a6c7d86bd0f37ecbda9103d6f3f3c7536507b1c325131cbfd53162aeb
generated_at: 2026-09-27T15:30:08.225194+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/unit/refunds.test.ts

## Purpose

Unit test for the corrupted-row guard in `performRefund`: verifies that a `succeeded` payment missing `providerRef` (an impossible state, since nothing succeeds before the provider is called) still transitions to `refunded` but is audited as a **failure**, not a success.

## Key elements

- **`corruptedPayment`** — a `asStub<PaymentDocument>` fixture with `status: 'succeeded'` and `providerRef: undefined`; the single corrupted state under test.
- **`jest.mock('@infrastructure/observability/audit', …)`** — full module replacement of `recordAudit` (not a spy). The mock delegates to a hoisted `jest.fn()` so the test can assert on it.
- **`describe` / `it` block** — one test: spies `paymentRepository.findByOrderId` and `updateStatusIfIn`, dynamically imports `performRefund`, calls it with an admin caller, then asserts `result.status === 'refunded'` **and** `recordAudit` was called once with `outcome: 'failure'`.
- **`afterEach(jest.restoreAllMocks)`** — restores the repository spies after each case.

## Relationships

- **`src/modules/payments/model.ts`** — provides the `PaymentDocument` type used by `asStub` and the repository spies.
- **`src/modules/payments/repository.ts`** — `paymentRepository.findByOrderId` and `paymentRepository.updateStatusIfIn` are spied and mocked to return the corrupted fixture.
- **`tests/support/stub.ts`** — `asStub` wraps both `corruptedPayment` and the post-update document, ensuring structural type compliance without a full implementation.

## Notes

- The audit module is **replaced** (`jest.mock`) rather than spied on (`jest.spyOn`). A named import in CommonJS compiles to a non-configurable getter on the module namespace, making `jest.spyOn` unable to redefine it. The same reasoning is documented in `create-audit.test.ts`.
- `performRefund` is imported via `await import(…)` **after** the repository spies are installed, guaranteeing the module closes over the replaced `recordAudit` and the mocked repository methods.
- The test asserts the status transition *does* happen (`'refunded'`) — the guard only suppresses the "success" audit, it does not block the state change.
