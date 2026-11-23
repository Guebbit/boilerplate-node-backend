---
source: src/modules/orders/tests/integration/billing-address.test.ts
generated_at: 2026-11-22T06:26:22.016917+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/tests/integration/billing-address.test.ts

## Purpose
Integration tests for `PUT /orders/{id}/billing-address`, the staff action that corrects who an order is invoiced to. They check that the address and VAT number are replaced (stored encrypted), that the timeline and audit trail record who made the change but not what changed, that an `order.billing_corrected` outbox event is emitted for `invoicing`, and that the change is refused once retention has erased the order's personal data. What `invoicing` does with the event is tested in that module, not here.

## Key elements
- `BEFORE` / `AFTER`: fixture addresses. `AFTER` is `BEFORE` with a new `fullName` ("Rossi Srl") and a `vatNumber`.
- `seedPaidOrder(billingAddress?)`: authenticates a buyer, creates a product, and creates a `paid` order. Passing `undefined` creates the order with no billing address. Returns `{ order, buyer }`, where `buyer` is the buyer's bearer token.
- `putBilling(orderId, bearer, body = AFTER)`: sends the PUT request as the given bearer.
- `jest.mock` of the audit port: replaces `@infrastructure/observability/audit` with `auditPortMock()` from `@tests/ports`. Tests then inspect calls through `observePort(auditPort.emitAuditEvent)`.
- Test cases:
  - Admin update returns 200, the raw Mongo document contains neither the name nor the VAT number, and the timeline shows `billing_corrected` without "Rossi".
  - A PUT replaces the whole address, so a VAT number left out is removed.
  - Exactly one `order.billing_corrected` outbox row is written, with payload `{ orderId }`.
  - Idempotency: repeating the same address returns 200 and adds no outbox row, timeline entry or audit event.
  - Exactly one billing-corrected audit event is emitted, with `targetType: 'order'` and the order id, and it contains no address data.
  - The buyer sees the new address on the order but no `billing_corrected` timeline row.
  - An order created without a billing address (admin-created) can be given one.
  - `actions.correctBilling` is `true` for staff and `false` for the buyer.
  - After retention erasure, the PUT returns 409 `ORDER_BILLING_LOCKED`, the address stays absent, `correctBilling` is `false`, and no outbox event is written.
  - A buyer calling the PUT gets 403.

## Relationships
- `tests/support/setup-test-db.ts`: `setupTestDb()` provides the test database.
- `tests/support/http.ts`: `api`, `authenticateAs` and `authenticateAsRole` give the HTTP client and the buyer and admin tokens.
- `tests/support/ports.ts`: supplies `auditPortMock` and `observePort`.
- `src/infrastructure/observability/audit.ts`: the audit port that is mocked and observed through `emitAuditEvent`.
- `src/modules/orders/audit.ts`: `ordersAuditActions` supplies the action constant the audit assertions filter on.
- `src/modules/orders/model.ts`: `orderModel` is used to read the raw stored document and to simulate retention erasure.
- `src/modules/orders/domain/anonymization.ts`: `ANONYMIZED_EMAIL` is set on the order to simulate retention erasure.
- `src/kernel/outbox.ts`: `outboxEventModel` is queried for `order.billing_corrected` rows.
- `src/modules/orders/tests/factories.ts` and `src/modules/products/tests/factories.ts`: `createOrder`, `toOrderItem` and `createProduct` build the seed data.
- `src/types/index.ts`: provides the `OrderStatus` enum used to seed paid orders.

## Notes
- The audit port is replaced rather than spied on; the reason is documented in `tests/support/ports.ts`.
- The "retention erased" case is simulated by directly setting `email` to `ANONYMIZED_EMAIL` and unsetting `billingAddress`. The real retention job is not run.
- Encryption is checked indirectly: the raw collection document, read via `orderModel.collection.findOne`, must not contain the plaintext values.
