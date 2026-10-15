---
source: src/modules/payments/tests/unit/refunds.test.ts
sha256: 45617c8b404a549b97a2f2cff2ba31c12fa0f602f71cc664efded8334c3d7582
generated_at: 2026-10-15T11:38:58.784313+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/unit/refunds.test.ts

## Purpose

Unit test for the corrupted-row guard in `performRefund`: when a payment is marked `succeeded` but carries no `providerRef`, the system must audit the refund as a **failure** (no real money ever moved) even though the repository operations complete normally. The suite proves the audit outcome in isolation, without a database.

## Key elements

- **`recordAudit` mock** — a `jest.fn()` injected via `jest.mock('@infrastructure/observability/audit', …)`. Replaced wholesale (not spied) because the named ESM import compiles to a non-configurable getter on the CJS namespace that `jest.spyOn` cannot redefine.
- **`announceInTransaction` / `withTransaction` mocks** — both reduced to no-op wrappers that call the callback with a dummy session. The suite has no database; atomicity is covered by integration suites.
- **`corruptedPayment`** — a `PaymentDocument` fixture (built with `asStub`) in the impossible state `status: 'succeeded'`, `providerRef: undefined`.
- **Single test case** — spies on `paymentRepository.findByOrderId`, `addRefund`, `settleRefund`, `updateStatusIfIn` and `orderService.markPaymentStatus`, `appendTimeline`. Then dynamically imports `performRefund` so it closes over the already-replaced `recordAudit`, invokes it, and asserts:
  - `result.status === 'succeeded'` (the operation itself "succeeds" mechanically),
  - `recordAudit` called once with `outcome: 'failure'`.

## Relationships

- **`src/modules/payments/model.ts`** — imports the `PaymentDocument` type used to shape both the corrupted and refunded fixtures.
- **`src/modules/payments/repository.ts`** — imports `paymentRepository`; four of its methods are spied on to drive the refund flow without a real Mongo.
- **`src/modules/orders/index.ts`** — imports `orderService` from this barrel; two methods (`markPaymentStatus`, `appendTimeline`) are spied on to short-circuit order-side writes.
- **`src/modules/orders/services/index.ts`** — the actual service implementation behind `orderService`; the test exercises its interface contract as called from the refund path.
- **`tests/support/stub.ts`** — provides `asStub<T>()`, a type-safe assertion helper that lets fixtures carry intentionally partial or undefined fields (e.g. `providerRef: undefined`) without TS complaints.

## Notes

- The dynamic `await import('../../services/refunds')` is **load-bearing**: it guarantees `performRefund`'s module-level closure captures the mock-injected `recordAudit` rather than the real one. Moving the import to the top of the file silently breaks the test.
- `afterEach(() => jest.restoreAllMocks())` restores all spies; the `jest.mock` factory mocks are module-scoped and persist for the whole file (intentional here — there is only one test).
- The test asserts on `recordAudit.mock.calls[0][1]` (the second argument), meaning the audit signature is `(action, payload)`. The `action` string `'admin.payment.refunded'` encodes the actor role in the dotted path.
