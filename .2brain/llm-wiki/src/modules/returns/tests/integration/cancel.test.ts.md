---
source: src/modules/returns/tests/integration/cancel.test.ts
sha256: c51c1e802012a9934b4586de9d113e026aabb6d10a06686654ec9b6104ed3463
generated_at: 2026-10-29T05:46:29.900222+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/integration/cancel.test.ts

## Purpose

Integration tests for `returnService.cancelReturn` — the `approved → canceled` transition for a return whose goods were never received. Verifies the operation is purely bookkeeping: no money moves, no stock changes, no domain events publish, and no email is sent. Also pins down which states are cancelable and what happens to the order after cancellation.

## Key elements

- **`paidAndDelivered()`** — fixture helper that builds the full pre-condition: user → two products → order → inventory reservation → card payment → `delivered` status. Returns a `Fixture` bundle.
- **`openedReturn(fixture, reason?, approve?)`** — creates a return on the fixture and (unless the reason is `withdrawal`) approves it as admin. Flushes the outbox and clears the mail mock so subsequent assertions start clean.
- **`refundsOf(orderId)`** — reads the refund list from `paymentService.getForOrder` for before/after comparisons.
- **`describe('canceling an approved return')`** — happy-path tests: status + `canceledAt` set; audit row with staff note; single timeline row (note excluded from timeline JSON); zero refunds/stock/events/mail change; returnable lines freed (2 shirts, 1 mug); withdrawal cancel works; `actions.cancel` toggles true→false.
- **`describe('what cannot be canceled')`** — error-path tests: double cancel → 409 `RETURN_NOT_CANCELABLE` with no extra audit/timeline; requested (unapproved) return refused; received return refused; declined return refused; unknown id → 404.
- **`describe('after a cancel')`** — post-condition tests: `receiveReturn` → `RETURN_NOT_RECEIVABLE`, `closeReturnByHand` → `RETURN_NOT_CLOSABLE`, and no refunds appear.

## Relationships

- **`src/modules/returns/services/index.ts`** — provides `returnService`, the system under test.
- **`src/modules/returns/module.ts`** — `returnsModule` is registered via `registerCheckoutModules` in `beforeEach`.
- **`src/infrastructure/adapters/mailer.ts`** — `enqueueEmail` is jest-mocked; tests assert it is *not* called after cancel.
- **`src/infrastructure/observability/audit.ts`** — `registerAuditSink` captures `AuditEntry[]` into a module-level `audited` array for assertions.
- **`src/kernel/outbox.ts`** — `settleOutboxNudges()` drains pending outbox work; `outboxEventModel.countDocuments` verifies no new events.
- **`src/kernel/events.ts`** — `resetDomainEvents` in `afterEach`.
- **`src/modules/payments/index.ts` / `src/modules/payments/services/index.ts`** — `paymentService` used to create/confirm payments and read refunds.
- **`src/modules/payments/module.ts`** — `paymentsModule` registered alongside `returnsModule`.
- **`src/modules/inventory/index.ts`** — `inventoryService.reserveForOrder` to hold stock in the fixture.
- **`src/modules/orders/tests/factories.ts`** — `createOrder`, `readOrder`, `timelineOf`, `toOrderItem` for order setup and assertions.
- **`src/modules/delivery/tests/factories.ts`** — `carryOrderTo(orderId, 'delivered')` advances the order state.
- **`src/modules/products/tests/factories.ts`** — `createProduct`, `countersOf` for product setup and stock assertions.
- **`src/modules/users/tests/factories.ts`** — `createUser` for the buyer identity.

## Notes

- The file's JSDoc header explicitly states the contract: cancel "holds no units, counts as no goods back, and moves no money, no stock, no event and no mail." The tests exist to keep that promise enforced.
- The staff `note` parameter on `cancelReturn` is written to audit metadata only; the test asserts it never appears in the order's public timeline JSON.
- A `withdrawal` return is "born approved" — `openedReturn` skips the explicit `approveReturn` call for that reason.
- `openedReturn` calls `settleOutboxNudges()` + `mockEnqueueEmail.mockClear()` so that acknowledgement/decision mails from the *setup* steps don't pollute the cancel assertions.
- The `audited` array is reset at the start of each test that makes a fresh cancel call (e.g., the 409 test resets it after the first cancel) to isolate per-operation audit rows.
