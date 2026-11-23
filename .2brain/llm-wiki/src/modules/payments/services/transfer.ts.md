---
source: src/modules/payments/services/transfer.ts
source_sha256: 67532ab2fd0ef4ce09d90e2e155de52ecb72fbc1a522a08951b7ac4a941359c8
context_sha256: 8a5b3c71a1e52ff23326d0198cfbe03709a11d7d61e423eca9dbd45ba2f82b97
generated_at: 2026-11-22T06:54:10.713036+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/services/transfer.ts

## Purpose
Opens the payment for a bank-transfer order. Money is owed from the moment such an order is placed, so on `order.created` this file creates a `requires_action` payment row carrying the RF reference, the deadline, and (on the wire) the transfer instructions, then mails those instructions to the buyer. An operator later finds the row by reference, records the money on it (`./offline`), and settles it through the shared `settlePayment`.

## Key elements
- `openTransferPayment(orderId: string): Promise<void>`: the `order.created` listener.
  - Loads the order with `orderService.getById`.
  - Does nothing unless `paymentMethod === 'bank_transfer'`, `payBy` is set, and `isPayable(order.status)`.
  - Calls `paymentRepository.openTransfer(orderId, buyerIdOf(order), { amount: orderTotal(order), currency, transferReference: buildReference(orderId), payBy })`.
  - If the call reports `created`, it mails the instructions via `mailTransferInstructions(order, opened.payment)`.

## Relationships
- **`@modules/orders`** (`index.ts`): provides `orderService`, `buyerIdOf`, `isPayable` and `orderTotal`. These are the order lookup and the status, buyer and total helpers.
- **`../repository`**: `paymentRepository` is used to insert the payment row (via its `openTransfer` method) and report whether it was newly created.
- **`../domain`** (`transfer-reference.ts`): `buildReference` generates the transfer reference from the order id.
- **`../config`**: `bankTransferEnabled()` decides whether the deployment still offers transfers.
- **`./notify`**: `mailTransferInstructions` sends the instructions email.
- **`@infrastructure/adapters/logger`**: used to warn the operator when a row is opened but no mail can be sent.

## Notes
- **Idempotent** under the outbox's at-least-once delivery. The row is inserted only if absent, and only the call that inserted it (`created`) sends the mail.
- **Existing payments are left untouched.** If a card payment or an operator-recorded payment already exists, nothing changes and no mail is sent.
- **Transfers disabled since the order was placed.** The row is still created, but no mail is sent and a `logger.warn` is emitted.
- **Silent no-ops.** Non-transfer orders, orders without `payBy`, and orders that are no longer payable return `undefined` without logging.
