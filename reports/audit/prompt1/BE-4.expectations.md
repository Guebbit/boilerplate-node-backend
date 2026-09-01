# BE-4 — Payments: provider port, refunds, webhooks — frozen expectations

Blind reading of Tier A only: `src/modules/payments/openapi.yaml`, `shared/contracts/openapi.root.yaml`
(schemas referenced by `$ref` from the payments contract), `src/modules/orders/openapi.yaml` (the
`cancel` endpoint, since it is the other Tier A source that states the money-and-refund invariant
named for this batch), and the root `asyncapi.yaml` bundle plus its three fragment sources
(`shared/contracts/asyncapi.root.yaml`, `shared/contracts/asyncapi.workers.yaml`,
`src/modules/observability/asyncapi.yaml`). No file under `src/` other than the `openapi.yaml` /
`asyncapi.yaml` contract files above was opened, and no test file was opened, before this file was
written and committed.

## Note on the named Tier A source for this batch

The batch instructions name "`asyncapi.yaml` at repo root, specifically the `order.cancelled`
event" as Tier A. **No `order.cancelled` channel, message, or schema exists anywhere in the async
contract** — not in the generated root bundle, and not in any of its three declared fragment
sources (grepped case-insensitively for "cancel" in all four files; zero hits outside this note).
The async contract has exactly seven channels, all `observability.*` or `worker.*`
(`asyncapi.yaml:34-113`), none order- or payment-related. This is recorded as **E13** below: there
is no async event for order cancellation to check code or tests against. The closest live Tier A
statement about cancel-triggered refunds is the synchronous `POST /orders/{id}/cancel` contract in
`src/modules/orders/openapi.yaml`, which is why it is included above despite being outside the
`payments` module folder — it is the other half of the money invariant named in this batch's
context line, and the payments refund endpoint's own doc text cross-references it.

## Expectations

- **E1** — `POST /payments/intent` freezes one of the caller's `pending` orders into a payment
  intent; the intent's `amount` is taken from the order's own lines, so it cannot quote a number
  different from the order. (`src/modules/payments/openapi.yaml:11`)
- **E2** — `POST /payments/intent` is idempotent per order: calling it again for the same order
  refreshes/returns the same intent rather than creating a second one — "one payment per order is
  a database fact". (`src/modules/payments/openapi.yaml:11`)
- **E3** — `POST /payments/intent` answers `409` (`errors[].code = PAYMENT_ORDER_NOT_PAYABLE`) when
  the target order is not `pending` any more, or already paid. (`src/modules/payments/openapi.yaml:11,30-32`)
- **E4** — `POST /payments/intent` operates only on "one of the caller's" orders; an order that
  doesn't exist (or isn't the caller's) answers `404`. (`src/modules/payments/openapi.yaml:11,29`)
- **E5** — `POST /payments/intent` succeeds with `201` and a `PaymentEnvelope` ("ready to confirm"),
  implying the created payment's `status` is `requires_confirmation`.
  (`src/modules/payments/openapi.yaml:21-27,155-158`)
- **E6** — `GET /payments/order/{orderId}` returns the payment for one of the caller's own orders;
  an admin may read anyone's; if no intent has been created yet for that order, the answer is `404`
  (absence is a valid answer, not an error state to work around).
  (`src/modules/payments/openapi.yaml:40`)
- **E7** — `POST /payments/order/{orderId}/refund` is admin-only; a non-admin caller gets `403`.
  (`src/modules/payments/openapi.yaml:66,73,90`)
- **E8** — `POST /payments/order/{orderId}/refund` returns the money **without** changing the
  order's own status field. (`src/modules/payments/openapi.yaml:68-69`)
- **E9** — `POST /payments/order/{orderId}/refund` writes conditionally on the payment currently
  being `succeeded`. A second call after the first succeeds answers `409`
  (`errors[].code = PAYMENT_NOT_REFUNDABLE`) — refunds exactly once, never twice.
  (`src/modules/payments/openapi.yaml:70-71,92-93`)
- **E10** — `POST /payments/order/{orderId}/refund` on success answers `200` with a `PaymentEnvelope`
  whose payment `status` is `refunded`. (`src/modules/payments/openapi.yaml:83-84`)
- **E11** — `POST /payments/{id}/confirm`: the provider charge happens first; the order is then
  moved `pending → paid` by a conditional write. If the order "slipped away" (no longer eligible)
  between the charge and that write, the charge is refunded on the spot and the response is `409`
  with `errors[].code = PAYMENT_ORDER_NOT_PAYABLE`. (`src/modules/payments/openapi.yaml:102,123-125`)
- **E12** — `POST /payments/{id}/confirm` with `cardNumber = 4000000000000002` is declined:
  response `409`, `errors[].code = PAYMENT_DECLINED`, and the same payment is retryable (accepts
  another `confirm` call with a different card afterward). Every other syntactically valid card
  number is accepted by the fake provider (`4242424242424242` is the conventional success card).
  (`src/modules/payments/openapi.yaml:102,123-124,230`)
- **E13** — `POST /payments/{id}/confirm` answers `409` with `errors[].code = PAYMENT_NOT_CONFIRMABLE`
  when the payment is not currently awaiting confirmation (i.e., not `requires_confirmation` and
  not a retryable `declined`). (`src/modules/payments/openapi.yaml:124`)
- **E14** — `POST /payments/{id}/confirm` on success answers `200` with a `PaymentEnvelope` whose
  payment `status` is `succeeded`; the underlying order's status becomes `paid`.
  (`src/modules/payments/openapi.yaml:115-116`)
- **E15** — `ConfirmPaymentRequest.cardNumber` is required, `minLength: 12`, `maxLength: 23`,
  pattern `^[\d ]+$` (digits and spaces only). A value outside that shape is a `422` validation
  error, not a `409` decline. (`src/modules/payments/openapi.yaml:220-230`)
- **E16** — `Payment.status` is a closed enum of exactly
  `[requires_confirmation, succeeded, declined, refunded]`. `declined` is retryable (the confirm
  endpoint accepts the same payment again); `refunded` is terminal (no further transition).
  (`src/modules/payments/openapi.yaml:155-158`)
- **E17** — `Payment.cardLast4` is "the only card digits a payment system may remember" — the full
  card number must never be persisted or returned on the `Payment` resource. `Payment` is
  `additionalProperties: false` with no field for the full number.
  (`src/modules/payments/openapi.yaml:136-164`)
- **E18** — `PaymentActions.pay` is `true` iff the payment is awaiting confirmation or is a
  retryable `declined`, **and** the order can still reach `paid`. It is a computed, per-caller
  field, not stored. (`src/modules/payments/openapi.yaml:166-168,185-190`)
- **E19** — `PaymentActions.refund` is `true` only while the payment is `succeeded`; it is `false`
  once refunded (and false for a payment that never succeeded — "nothing to return" per the
  refund endpoint's own `409` doc). (`src/modules/payments/openapi.yaml:191-196` combined with
  `src/modules/payments/openapi.yaml:92-93`)
- **E20** — Money invariant across the order/payment boundary: on `POST /orders/{id}/cancel`, a
  **customer**-initiated cancellation is **always** refunded and the customer **cannot waive it**
  (the `refund` field of `CancelOrderRequest` is documented as "Ignored for a customer, who is
  always refunded"). Only an **operator/admin** may choose `refund: false` to cancel without
  returning money. This governs whichever payments-module code path a customer-initiated
  cancellation drives to trigger a refund; a test that lets a customer suppress their own refund,
  or that treats `refund: false` as available to a non-admin caller, contradicts this Tier A
  sentence. (`src/modules/orders/openapi.yaml:274-278,363-376`)
- **E21** — There is no `order.cancelled` (or any order/payment) event in the AsyncAPI contract at
  all — see the note above. Any payments test that asserts a publish/subscribe on such a channel,
  or that a refund is driven by consuming an async "order cancelled" message, has no Tier A
  contract backing it (candidate `SPEC-SILENT`, or `MISMATCH-SPEC` if the omission itself looks
  like the bug). (`asyncapi.yaml:34-113`, `shared/contracts/asyncapi.root.yaml`,
  `shared/contracts/asyncapi.workers.yaml`, `src/modules/observability/asyncapi.yaml`)
- **E22** — Every payments endpoint requires `bearerAuth`; an unauthenticated caller gets `401` on
  all four operations (`createPaymentIntent`, `getPaymentByOrder`, `refundPaymentByOrder`,
  `confirmPayment`). (`src/modules/payments/openapi.yaml:13-14,42-43,73-74,104-105`)
- **E23** — `Payment.amount` is `type: number, minimum: 0` and `Payment.currency` is an ISO-4217
  string (e.g. `EUR`) — a payment never carries a negative amount, and currency is not assumed to
  always be one hardcoded value by the schema itself. (`src/modules/payments/openapi.yaml:147-154`)
