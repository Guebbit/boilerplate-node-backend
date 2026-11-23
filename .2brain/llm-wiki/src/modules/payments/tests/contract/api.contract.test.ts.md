---
source: src/modules/payments/tests/contract/api.contract.test.ts
source_sha256: 7fde077911a6472777f427f311b124d30215871747dcf10cb1ba6b89346e808a
context_sha256: 8e13a77dc30d0b1d034eea410950eeb4bcb5e8556d29a9ed712790dc8516ba38
generated_at: 2026-11-22T06:54:56.235400+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/tests/contract/api.contract.test.ts

## Purpose
HTTP-level contract tests for the `/payments` routes. Every route requires authentication, and all but the reference lookup answer a `PaymentEnvelope` (the reference lookup answers an `Order`, since it precedes any payment). The suite checks that each contract branch is actually reached over HTTP: the 201 intent, the 200 confirm, the three distinguishable 409s, and the 404s. The money rules themselves are covered in the unit suite, not here.

## Key elements
- **`GOOD_METHOD` / `DECLINE_METHOD`**: the literals `pm_card_visa` and `pm_card_declined`. They are deliberately not imported from the fake PSP, so the inputs come from the provider's published documentation rather than the code under test.
- **`authenticateWithOrder()`**: logs in a customer with one pending order (product priced `10.00`, quantity 2) and returns `{ bearer, order }`.
- **`authenticateWithIntent()`**: extends the above by calling `POST /payments`. It throws a descriptive setup error if the response is not 201, and returns `{ bearer, order, paymentId }`.
- **`transferOrderOf()`**: opens a pending `bank_transfer` order through the `transferOrder` factory (imported as `openTransferOrder`). Returns the order, its RF `reference`, and `customerBearer`.
- **`paidOrder()`**: pays an intent in full over HTTP (confirm with `GOOD_METHOD`) and throws if the result is not 200 `succeeded`. This is the starting fixture for the refund tests.
- **`disputeEvent(providerRef, over)`**: builds a chargeback dispute webhook delivery body, with optional field overrides.
- **Test groups visible in this excerpt**:
  - `GET /payments/methods`: works unauthenticated and lists `card`.
  - "with no card payment provider configured": sets `NODE_PAYMENT_PROVIDER` to undefined. `card` is not listed, `POST /payments` answers 409 `PAYMENT_CARD_NOT_AVAILABLE` and creates no payment, and `POST /payments/webhook/fake` still answers 204 for a signed body.
  - `POST /payments`:
    - A fresh intent returns 201 with `amount` `20.00`, status `requires_confirmation` and the `actions` map (`pay: true`, the rest false or empty).
    - Repeating the request returns 200 with the same id and no `Location` header. The first response is 201 with `Location: /payments/{id}`.
    - `providerRef` is never exposed. `clientSecret` appears only on the intent response, not on `GET /orders/{id}/payments`.
    - 404 for a missing order and 422 for an invalid body.
  - `POST /payments/{id}/confirm`: success (200 `succeeded`, all actions false or empty), declined card (409 `PAYMENT_DECLINED`), missing payment (404), plus a parameterised `it.each` over card-number-like inputs (the rest is not visible).

## Relationships
- **`tests/support/contract.ts`** (`@tests/contract`): imported for its side effects to set up the contract-test environment. Other `@tests/*` helpers supply `setupTestDb`, `api`, `authenticateAs`, `authenticateAsRole`, `staleBearerFor`, `MISSING_ID` and `setEnvironment`.
- **Factories** (`users`, `products`, `orders`, `payments` tests/factories): create the users, products and orders. The payments `transferOrder` factory sets up the bank-transfer fixture.
- **`src/modules/payments/providers/index.ts`**: provides `signWebhookPayload` and `WEBHOOK_SIGNATURE_HEADER`, used to sign webhook requests.
- **`src/modules/payments/providers/registry.ts`**: provides `registerPaymentProvider`.
- **`scenarios/support/doubles/payments/fake.ts`**: provides the fake provider and its controls (`fakePaymentProvider`, `setFakeOutcome`, `setFakeRefundFailure`, `addFakeExternalRefund`). The webhook path `/payments/webhook/fake` targets this adapter.
- **`src/modules/payments/repository.ts`**: provides `paymentRepository`, whose `findByOrderId` is used to assert that no payment was opened.
- **`src/modules/inventory`**, **`src/kernel/events.ts`** (`onDomainEvent`), **`src/kernel/outbox.ts`** (`settleOutboxNudges`) and **`src/modules/orders`** (`ORDER_STATUS_CHANGED`) are imported, presumably for later tests. Their use is not visible in the shown portion.

## Notes
- Test inputs are intentionally written as literals instead of being imported from the double. This means a rename on either side can't pass silently.
- Setup helpers throw explicit "payments setup failed" errors, so fixture failures are distinguishable from assertion failures.
- The webhook route is selected by the path (`/payments/webhook/{provider}`), not by the environment variable. An installed adapter stays reachable even when no card provider is configured.
