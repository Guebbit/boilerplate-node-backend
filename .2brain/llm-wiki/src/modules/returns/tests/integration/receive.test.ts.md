---
source: src/modules/returns/tests/integration/receive.test.ts
source_sha256: 9be7fbb4d2d42f71f2df1c6ac19e0ddb87d13160932ffbde517e68e59a64f77f
context_sha256: 3c662a7c635bf9ff7d62ee425e87e7b49dea860dadd91993a3c7f0c092f7bc94
generated_at: 2026-11-22T07:36:11.728560+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/tests/integration/receive.test.ts

## Purpose
Integration tests for `returnService.receiveReturn`, run against a real test database and the real `fake` payment provider. They check that the status move and the restock happen in one transaction. They also check that the refund is opened on the payment, carrying the return's id, before the provider is asked. A return the provider refused should be closed later by the refund that finally lands, not left stuck.

## Key elements
- **Mocks**
  - `@infrastructure/adapters/mailer` is replaced with a jest mock; `mockEnqueueEmail` is cleared before each test so cases can assert which mail was enqueued.
  - `@infrastructure/observability/audit` is replaced with `auditPortMock()` from `@tests/ports`.
- **Setup**
  - `setupTestDb()` provides the database.
  - `beforeEach` calls `registerCheckoutModules([paymentsModule, invoicingModule, returnsModule])`.
  - `afterEach` calls `resetDomainEvents()` and `jest.restoreAllMocks()`.
- **`paidAndDelivered(shipping?, shippingMethod?, mugTaxClass?)`** builds a fixture:
  - a new user with a unique email, two shirts at 30.00 and one mug at 10.00 (optionally at the reduced tax class), and optional shipping;
  - stock reserved through `inventoryService`;
  - payment created and confirmed with `pm_card_visa`;
  - the order carried to `delivered` with `carryOrderTo`.
- **`approvedReturn(fixture, reason, lines?)`** creates a return. It approves it as admin when the reason is not `withdrawal`, then calls `settleOutboxNudges()` so the event-driven mails land as setup. It returns the return id.
- **`paymentOf` and `wireOrder`** read the payment and the order as the wire serves them. Both throw if the record is missing.
- **Test groups**
  - "the statuses the order shows beside its own" covers `returnStatus` moving from `none` through `in_progress` to `returned` or `partially_returned`. It also covers `paymentStatus` becoming `refunded` or `partially_refunded`.
  - "goods excluded from the right of withdrawal" covers a `noWithdrawal` product. The refund is `30.00` (shirt only), the delivery charge stays with the shop, and the order still reads `returned`.
  - "receiving a return" covers:
    - the happy path: `onHand` is restored, the refund is 70.00 with `reason: 'return'` and `returnId`, and `RETURN_RECEIVED` and `RETURN_CLOSED` both fire;
    - the withdrawal refund stamp (`dueRule: 'withdrawal'`, `dueBy` from `withdrawalRefundDueBy(requestedAt, shopTimezone())`), read with `storedRefundStamps`;
    - a case where `requestedAt` is moved 20 days back (`DAY_MS`) via `returnModel.updateOne`, so the goods arrive after the 14 days.

## Relationships
- `@kernel/events`: `onDomainEvent` subscribes to the received and closed events; `resetDomainEvents` cleans up afterwards.
- `@kernel/outbox`: `settleOutboxNudges` flushes outbox-driven mails and events during setup.
- `@domain-primitives/time`: `DAY_MS` backdates the return request.
- `@infrastructure/adapters/mailer`: mocked (`enqueueEmail`).
- `@infrastructure/observability/audit`: mocked through the ports helper.
- `@modules/inventory`: imports `inventoryService`, which the fixture uses to reserve stock for the order.
- `@modules/invoicing` (index and `module`): `invoicingModule` is registered for checkout, and `invoicingService` and `CreditNoteDocument` are imported.
- `@modules/delivery/tests/factories`: `carryOrderTo` moves the order to delivered.
- `@modules/access/tests/factories`: `seedMembership` is imported.
- `@modules/orders`: `orderService` and `withdrawalRefundDueBy` are imported, and the exclusion test relies on the withdrawal rules.
- `@kernel/access/tenant`: `DEPLOYMENT_TENANT_ID` is imported.
- Several other imports have no corresponding graph neighbor: payments and products factories, `returnService`, the returns repository and model, and the `@tests/*` helpers.

## Notes
- The file continues past the visible portion. The tests listed above are only those visible there. The module doc mentions refused-then-later-succeeded refunds, but the visible tests do not cover them.
- Several imports are not visibly used in the first portion of the file: `DEPLOYMENT_TENANT_ID`, `orderService`, `invoicingService`, `CreditNoteDocument`, `seedMembership`, `asReject`, `timelineOf`, `refundOrderPayment` and `observePort`. They are presumably used in later tests.
- Each fixture takes a fresh buyer email from a module-level counter, so tests do not collide on users.
- Mock stock after delivery is `onHand: 8` for shirts, and a successful receive restores it to 10.
