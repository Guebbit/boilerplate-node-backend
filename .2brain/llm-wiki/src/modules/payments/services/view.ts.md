---
source: src/modules/payments/services/view.ts
source_sha256: 93d8fec94e466d137ac48f0a8fa439b5141377d3b66b59aef938905ed1794ea7
context_sha256: 8a4d1cd75fb853dc679ab11ac46018d7f35a37115146d5876f3b35f42118e8f9
generated_at: 2026-11-22T06:54:35.435130+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/services/view.ts

## Purpose
Read side of the payments service. It fetches payments (by order, by id, or a single refund), presents them on the wire, and attaches an `actions` object, the contract's `PaymentActions`. The `actions` flags tell the caller what they may do next, in the same way `orders` publishes `OrderActions`.

## Key elements
- `getForOrder(orderId, authContext?)`: the payment behind an order, for the order page's payment panel. It returns a 404 reject when none is visible.
- `listForOrder(orderId, authContext?)`: backs `GET /orders/{id}/payments`. It reads the order first through `orderService.getForCaller`. If the caller can't see the order, the result is a 404 with the "order not found" message. Otherwise it returns `{ items }` holding zero or one payment.
- `getById(paymentId, authContext?)`: one payment by its own id. A missing payment and another caller's payment get the same 404.
- `getRefund(paymentId, refundId, authContext?)`: one refund, addressed through its payment. Missing payment, missing refund and another's payment all give the same 404.
- `refundOf(payment, refundId, authContext?)`: finds one refund by id on an already loaded payment. This avoids picking whichever refund is newest when a racing request added another.
- `orderIdOf(paymentId)`: the order id of a payment, read with no caller scope. It is used for notices such as the staff notice for a refund with an unknown outcome. It returns `undefined` if the payment is missing.
- `withActions(payment, order, authContext?)`: presents a payment and adds `actions`:
  - `pay`
  - `sync`
  - `refund`
  - `settleRefundByHand` (a list of refund ids)
  - `cancelRefund` (a list of refund ids)
  - `syncRefunds`
- `presentWithActions(payment, authContext?)`: for write responses (confirm, sync, intent). It loads the order, which is used for `pay` only, then calls `withActions`.
- Private predicates behind the flags:
  - `isPayerWithCheckout`
  - `mayRefund`
  - `mayPay`
  - `maySync`
  - `maySyncRefunds`
  - `settleableByHand`
  - `cancelableRefunds`

## Relationships
- **`../repository` (`paymentRepository`)**: `findByOrderId` and `findByIdScoped` do the lookups. Both take `callerScope(authContext)` from `./scope`.
- **`../presenter`**: `presentPayment(payment, readsAllPayments(authContext))` builds the wire shape. The boolean controls the staff-only fields.
- **`../domain`**: supplies the status sets (`CONFIRMABLE_PAYMENT_STATUSES`, `IN_FLIGHT_PAYMENT_STATUSES`, `REFUNDABLE_PAYMENT_STATUS`) and the predicates (`hasOpenChargeback`, `isHandRecorded`, `isOpenTransfer`, `mayBeSettledByHand`, `mayBeCanceled`).
- **`../providers`**: `resolvePaymentProvider()` decides whether an open transfer can be taken over with a card.
- **`../model`**: provides the `PaymentDocument` type.
- **`@modules/orders`**: `orderService` (`getForCaller`, `getById`, `callerScope`) loads the order. `isPayable` checks that the order can still reach `paid`. `OrderDocument` is imported as a type.
- **`@kernel/permissions` and `@kernel/ability`**: `callerForSubject(authContext, 'Payment')` together with `holds(...)` checks the abilities `checkout:Cart` and `create:Refund`.
- **`@infrastructure/http/response`**: `generateSuccess` and `generateReject` build the responses.
- **`@infrastructure/i18n`**: `t(...)` provides the translated "order not found" message for the 404.
- **`./refund-settlement`**: `remainingOf` gives the refundable remainder.
- **`./errors`**: `paymentNotFound()` produces the standard 404.

## Notes
- `pay` and `sync` are never both true. `maySync` covers only in-flight, provider-backed payments, while `pay` covers payments awaiting confirmation, declined payments, and open transfers.
- `pay` needs all of these:
  - a confirmable status, or an open transfer with a provider available;
  - an order that is still payable;
  - a caller who is the payer and holds `checkout:Cart`.
- The `order` argument is optional. When it is absent, as for list rows or already succeeded payments, `pay` is `false`.
- `refund` needs all of these:
  - the caller holds `create:Refund`;
  - the payment status equals `REFUNDABLE_PAYMENT_STATUS`;
  - `remainingOf(payment) > 0`;
  - there is no open chargeback.
- `mayRefund` checks `create:Refund` by name on purpose. A moderator holds exactly that key, and a broader check would hide the action from them.
- `cancelRefund` returns a subset of what `settleRefundByHand` returns, minus refunds that settled and later came back.
- `syncRefunds` needs `create:Refund`, the refundable status, a non-hand-recorded payment, and a `providerRef`.
- `isPayerWithCheckout` is `false` when there is no `authContext`, for another customer, and for a payment whose account was erased (`userId` missing).
- `getById` and `getRefund` return the same 404 for "missing" and "not yours", so they don't reveal which payment ids exist.
