---
source: src/modules/returns/tests/integration/staff-opens.test.ts
sha256: 0f877c6c7a64f0512713984f77a4ac81096ca504daefded7f04b0edf3d53759d
generated_at: 2026-10-29T05:49:55.892505+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/integration/staff-opens.test.ts

## Purpose

Integration tests for the "staff opens a return on the buyer's behalf" flow. Verifies that a support or moderator call produces an immediately-approved return, that the buyer receives exactly one notification email, that audit/timeline records name the staff actor, that policy waivers (closed window, excluded goods) are recorded correctly, and that authorization, date, channel, and quantity guards reject bad input.

## Key elements

- **`buyerWithOrder(wanted?: Wanted)`** – Fixture factory: creates a user, a shirt (30.00) and a mug (10.00), places an order, and reserves inventory. `excluded: true` flags the mug as `noWithdrawal` (made-to-order).
- **`deliveredOrder(wanted)`** – Wraps `buyerWithOrder`, advances the order to `delivered`, sets the withdrawal deadline (`endsInDays`, default +7), settles outbox nudges, and clears email mocks.
- **`paidOrder()`** – Fixture for a paid-by-card, still-pending order (used for refund-path tests in the truncated remainder).
- **`staff(role: 'support' | 'moderator')`** – Returns a `[auth, callerContext]` tuple pairing the JWT-style auth object with the audit/caller-context object.
- **`Wanted` interface** – Configuration knobs for fixtures: `madeDaysAgo`, `excluded`, `status`.
- **`describe('staff opening a return for the buyer')`** – Happy-path (approval, email, audit, timeline), `requestedAt` boundary validation, `statedVia` channel restriction, 404 for unauthorized roles (warehouse, stranger), quantity-overflow guard, and decline-then-reopen semantics.
- **`describe('what staff waive, and what they cannot')`** – Policy-exception recording: `window_closed` for past-deadline goodwill, no exception when the buyer's stated date is in-window, `excluded_goods` for made-to-order items (truncated).

## Relationships

- **`src/modules/returns/module.ts`** – `returnsModule` is registered via `registerCheckoutModules` in `beforeEach`, wiring the returns service into the checkout pipeline.
- **`src/modules/returns/repository.ts`** – `returnRepository.findByOrderId` is queried directly to assert that no return row was persisted after a rejected call.
- **`src/kernel/outbox.ts`** – `settleOutboxNudges()` flushes pending outbox work before assertions; `outboxEventModel` is queried to confirm `return.requested` / `return.decided` events were emitted.
- **`src/kernel/events.ts`** – `resetDomainEvents()` in `afterEach` prevents domain-event state leaking between tests.
- **`src/infrastructure/adapters/mailer.ts`** – Fully mocked with `jest.mock`; `enqueueEmail` calls are inspected to assert subject, recipient, and `returns.notice` template.
- **`src/infrastructure/observability/audit.ts`** – `registerAuditSink` pipes every audit entry into a local `audited` array for per-test assertions (e.g., `onBehalfOfBuyer: true` metadata).
- **`src/modules/orders/tests/factories.ts`** – `createOrder`, `readOrder`, `setWithdrawUntil`, `timelineOf`, `toOrderItem` are the primary order-level fixtures and assertions.
- **`src/modules/delivery/tests/factories.ts`** – `carryOrderTo` transitions the order to `delivered` so the return window is active.
- **`src/modules/inventory/index.ts`** – `inventoryService.reserveForOrder` ensures stock is held before the return flow is exercised.
- **`src/modules/payments/module.ts`** – `paymentsModule` registered alongside returns so the payment lifecycle is available for the paid-order tests.
- **`src/modules/payments/tests/factories.ts`** – `payByCard` completes a card payment in the `paidOrder` fixture.
- **`src/modules/products/tests/factories.ts`** – `createProduct` builds the shirt and mug test items.

## Notes

- The mailer adapter is **fully replaced** by a Jest mock; no real email infrastructure is touched. Always call `mockEnqueueEmail.mockClear()` (done in `beforeEach` and inside fixture helpers) before the assertion window you care about.
- `settleOutboxNudges()` is a **synchronous drain** that must run before you read `outboxEventModel` or check email mock calls; forgetting it leaves events in a pending state and assertions will see zero rows.
- `staff()` returns a **two-element tuple**, not a single object. The first element is the auth credential passed to the service; the second is the caller-context used for audit/timeline attribution. Swapping them will fail authorization or produce wrong audit metadata.
- `setWithdrawUntil` sets the deadline **relative to wall-clock `Date.now()`**, so tests are time-sensitive; the `endsInDays` parameter makes the window explicit (negative = already expired).
- The `excluded` flag on the mug exercises the Art. 16 / made-to-order exclusion path; it is the only way to trigger the `excluded_goods` policy exception in these tests.
- The file is **truncated** in the content provided; the `describe('what staff waive…')` block likely contains additional cases (e.g., goods that even staff cannot override).
