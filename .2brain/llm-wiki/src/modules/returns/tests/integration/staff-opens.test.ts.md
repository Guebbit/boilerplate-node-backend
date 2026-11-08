---
source: src/modules/returns/tests/integration/staff-opens.test.ts
sha256: c142c9348c28960dc339235bf682b988fe42cbef0594894e16792ea4d10288cb
generated_at: 2026-11-08T08:11:40.634709+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/integration/staff-opens.test.ts

## Purpose

Integration tests that exercise the staff-initiated return path (support or moderator opening a return on behalf of a buyer). Covers the happy path (approved return with single buyer notification), date and channel validation, authorization rejections (404 for warehouse/stranger), quantity guards, recovery from a prior declined return, and the policy-waiver surface (`window_closed`, `excluded_goods`) including the boundary of what staff *cannot* waive.

## Key elements

- **`buyerWithOrder(wanted)`** — Creates a customer, a shirt (30.00) and a mug (10.00, optionally `noWithdrawal`), an order with configurable `createdAt`/status, and reserves inventory. Returns the fixture for downstream steps.
- **`deliveredOrder(wanted & { endsInDays })`** — Builds on `buyerWithOrder`, marks the order `delivered`, sets the withdrawal deadline, settles outbox nudges, and clears the email mock.
- **`paidOrder()`** — Builds a pending order three days old, pays by card via `payByCard`, settles outbox.
- **`staff(role)`** — Returns `[authContext, callerContext]` tuple for `'support'` or `'moderator'`.
- **`describe('staff opening a return for the buyer')`** — Six tests: approved creation + side-effects (outbox events, single email, audit `onBehalfOfBuyer`, timeline actors, `order.returnStatus`); `requestedAt` bounds (future / before-order rejected, valid date preserved); `statedVia` on non-withdrawal reason rejected; 404 for warehouse and stranger; quantity guard (second return on same line rejected); declined-return recovery (new return succeeds, old one no longer decidable).
- **`describe('what staff waive, and what they cannot')`** — Tests that a goodwill return past the deadline records `window_closed`; that a buyer's in-window ask opened late records no exception; that made-to-order goods are allowed with `excluded_goods` recorded.
- **Mailer mock** — `enqueueEmail` is jest-mocked; calls are inspected per test to verify exactly one `returns.notice` with the expected subject.
- **Audit sink** — `registerAuditSink` collects entries into `audited[]` (reset in `beforeEach`) for assertions on `metadata.onBehalfOfBuyer`.

## Relationships

- **`src/modules/returns/module.ts`** — Registered via `registerCheckoutModules([paymentsModule, returnsModule])` so the service is available in the test container.
- **`src/modules/returns/repository.ts`** — `returnRepository.findByOrderId` used to assert no row was written after a rejected call.
- **`src/kernel/outbox.ts`** — `settleOutboxNudges` flushes queued domain events; `outboxEventModel` queried to assert `return.requested` / `return.decided` names.
- **`src/kernel/events.ts`** — `resetDomainEvents` in `afterEach` to isolate event state between tests.
- **`src/infrastructure/adapters/mailer.ts`** — Mocked module; the real implementation is never invoked.
- **`src/infrastructure/observability/audit.ts`** — Real audit sink registered per test to capture `AuditEntry[]`.
- **`src/modules/orders/tests/factories.ts`** — `createOrder`, `readOrder`, `setWithdrawUntil`, `timelineOf`, `toOrderItem`.
- **`src/modules/delivery/tests/factories.ts`** — `carryOrderTo` advances order to `delivered`.
- **`src/modules/inventory/index.ts`** — `inventoryService.reserveForOrder` called in the fixture setup.
- **`src/modules/payments/module.ts`** / **`src/modules/payments/index.ts`** — `paymentsModule` registered; `paymentService` available.
- **`src/modules/payments/tests/factories.ts`** — `payByCard` used by `paidOrder`.
- **`src/modules/products/tests/factories.ts`** — `createProduct` for fixture items.

## Notes

- The test relies on a **real database** (`setupTestDb`) and real service wiring; only the mailer is mocked.
- `settleOutboxNudges()` must be awaited **before** asserting on `mockEnqueueEmail` calls or outbox rows, otherwise events are still queued.
- The `customers` counter guarantees unique emails across the whole file (no `beforeEach` reset), so parallel workers in the same process won't collide.
- The `staff` helper is a plain function, not a jest factory; it always returns a 2-tuple typed as `[auth, callerContext]`.
- Authorization negatives expect **404** (not 403), matching the convention that the resource is "invisible" to unauthorized callers.
- `statedVia` is only valid for withdrawal-type reasons; passing it with `defective` yields `RETURN_STATEMENT_INVALID` and writes **no** repository row.
