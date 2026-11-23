---
source: src/modules/payments/tests/integration/service.test.ts
source_sha256: 20b44c01e4172c29f9a379ac6f750d93c279f7d656ea22ed4381cbed9082000f
context_sha256: ba70dfa0d553d2eb377488db9dbd830e9969c68bac18d85a61421d682dfae9c8
generated_at: 2026-11-22T07:02:07.524359+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/tests/integration/service.test.ts

## Purpose
Integration test for the payments service (`src/modules/payments/services/`). It runs against real Mongo (via `setupTestDb()`), using the real `fake` payment provider, because the guarantees under test are conditional database writes. It pins these invariants:
- The intent freezes the order's total, shipping included.
- A confirm moves the order `pending → paid` conditionally, so the payment row says `succeeded` only when the order does.
- A decline is retryable.
- The refund (the `order.canceled` listener) is at-most-once.

## Key elements
- `jest.mock('@infrastructure/observability/audit', ...)`: replaces the audit port with `auditPortMock()` from `@tests/ports` instead of spying on it.
- `GOOD_METHOD` (`pm_card_visa`): an opaque card reference used for successful confirms.
- Local fixtures:
  - `orderFor(price, quantity)` creates a user, a product and a pending order.
  - `auth(user)` wraps `asCustomer`.
  - `paidOrder()` creates an order and pays it via `payByCard`.
- `describe('createIntent')` checks that:
  - the amount equals the order's published `totalPrice` (e.g. `115.00` with express shipping);
  - repeat calls return the same intent, so there is one payment per order;
  - another user's order gives 404;
  - a non-pending order gives 409 `PAYMENT_ORDER_NOT_PAYABLE`;
  - the method is written as `card`.
- `describe('confirmPayment')` checks that:
  - a successful confirm sets the order to `paid` and the payment to `succeeded` with `cardLast4` `4242`;
  - a card payment overwrites an order's `bank_transfer` method with `card`, while `recordOfflinePayment` keeps `bank_transfer`;
  - a decline (`FAKE_DECLINE_METHOD`) returns 409 `PAYMENT_DECLINED`, leaves the order `pending`, and the same payment can be confirmed again with a good card;
  - a payment that is not the caller's gives 404;
  - a second confirm gives 409 `PAYMENT_NOT_CONFIRMABLE`;
  - a new intent is refused once the money has moved.
- The file imports further helpers that are not exercised in the visible part: `refundOrderPayment`, `deliver`, `signFakeDelivery`, `setFakeOutcome`, `WebhookRejected`, `WebhookProviderUnknownError`, `PAYMENT_SUCCEEDED`, `ORDER_STATUS_CHANGED`, `resetDomainEvents`, `settleOutboxNudges`, `outboxEventModel`. These point to webhook, refund and event/outbox coverage further down.

## Relationships
- `scenarios/support/doubles/payments/fake.ts`: supplies the fake provider, `FAKE_DECLINE_METHOD`, `setFakeOutcome` and `signFakeDelivery`.
- `@modules/payments/*` (`services`, `repository`, `model`, `events`, `module`, `providers`): the code under test and its persistence and event constants. `providers` supplies `WebhookRejected` and `ProviderWebhookEvent`.
- `src/modules/orders/index.ts`, `src/modules/orders/services/index.ts` and `src/modules/orders/tests/factories.ts`: `orderService` reads order state, and the factories build and force-status orders. `ORDER_STATUS_CHANGED` also comes from `@modules/orders`.
- `src/modules/inventory/index.ts` and `src/modules/inventory/services/index.ts`: `inventoryService` is imported, and the visible part does not use it.
- `src/modules/access/tests/factories.ts`: `seedMembership`.
- `src/kernel/events.ts` and `src/kernel/outbox.ts`: domain-event reset and the outbox model and nudge settling.
- `src/kernel/access/tenant.ts`: `DEPLOYMENT_TENANT_ID`.
- `src/infrastructure/observability/audit.ts`: mocked with the audit port double.

## Notes
- Tests assert on stable error codes (`PAYMENT_*`) and HTTP statuses, using `asReject`.
- Another caller's order or payment returns 404 (absence), not 403.
- Test names reference regressions: the intent summed the lines itself and under-charged shipping, and `JB8` covers the payment-method vocabulary.
