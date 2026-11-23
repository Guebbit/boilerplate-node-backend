---
source: scenarios/support/doubles/payments/levers.ts
source_sha256: 4caeb1818d7b3c685d8b48affd990b6ffc79ea51435c5702698b737e87c0f1c3
context_sha256: 148ce95c9109a08e126e75ce4e5af5f62d38776d5e6f8dfeab106c19ca31b6fe
generated_at: 2026-11-22T01:48:06.308994+00:00
model: claude-code:claude-sonnet-5-5
---

# scenarios/support/doubles/payments/levers.ts

## Purpose
Defines the demo profile's payments "levers": test-only HTTP endpoints that drive the fake PSP (payment service provider) into failure and dispute states. `POST /__test/payments/refund-failure` makes the fake refuse an order's refunds (or stop refusing). `POST /__test/payments/dispute` has the buyer's bank dispute an order's payment, or moves an existing dispute along. The file sits beside `./fake` because `payments` is a `group: shop` module and `demo:remove` deletes the folder with it. A generated levers file is rebuilt from the folders that remain, so the demo's control surface (`scenarios/support/demo.ts`) never names a module.

## Key elements
- `installLever(app)`: the only export. It mounts both routes on the Express app and is called by `installModuleLevers`, from `installDemo`.
- `REFUND_FAILURE_BODY`: zod schema with `orderId` (must be an ObjectId string) and `reason`, a `RefundFailureReason` enum value or `null` to clear the failure.
- `DISPUTE_BODY`: zod schema for the dispute.
  - `orderId` is required.
  - Defaults: `disputeId` `'dp_demo'`, `kind` `'chargeback'`, `status` `'needs_response'`, `reason` `'fraudulent'`, `evidenceInDays` 14.
  - `amount` is optional.
- `paymentOf(orderId)`: reads the payment straight from the `payments` collection, because the wire shape hides `providerRef`.
- `providerRefOf(orderId)`: returns the provider id from `paymentOf`.
- `installDisputeLever(app)`: mounts the dispute route.
  - It validates the body, then looks up the payment and returns 404 if it has no `providerRef` or `currency`.
  - It calls `setFakeDispute` with the provider-style report. The amount defaults to the payment's amount.
  - `fundsWithdrawn` is true for a chargeback that is not `won`. `evidenceDueBy` is now plus `evidenceInDays` (using `DAY_MS`).
  - It then signs the delivery with `signFakeDelivery` and passes it to `paymentService.receiveWebhook('fake', ...)`. Success returns 204.
- Refund-failure route (inside `installLever`): validates the body, looks up the `providerRef`, and calls `setFakeRefundFailure(providerRef, reason ?? undefined)`. Success returns 204, a missing payment returns 404.

## Relationships
- `./fake`: provides `setFakeDispute`, `setFakeRefundFailure` and `signFakeDelivery`, which hold the double's state and sign deliveries.
- `@modules/payments` (`paymentService`): the dispute lever feeds the signed webhook through `receiveWebhook`.
- `@infrastructure/runtime/database` (`connection`): used for the direct `payments` collection read.
- `@infrastructure/persistence/create-repository`: `isObjectIdString` validates `orderId`.
- `@infrastructure/http/response`: `rejectResponse` produces the 400, 404 and 500 replies.
- `@infrastructure/adapters/logger`: logs lever failures.
- `@types`: supplies the `DisputeKind`, `DisputeReason`, `DisputeStatus` and `RefundFailureReason` enums.
- `@domain-primitives/time`: supplies `DAY_MS`.
- Tests: `tests/integration/journeys/the-provider-disagrees.test.ts` and `tests/unit/scenarios/payments-fake.test.ts` are related neighbors.

## Notes
- The dispute lever gets no shortcut past the signature check. It signs the delivery and sends it through the same webhook door the real route uses.
- Repeating a `disputeId` addresses the same dispute, so sending a new `status` advances it.
- `null` for `reason` is converted to `undefined`, which is how the double clears a failure.
- Both routes return 404 `no payment with a provider reference` if the order has no payment with a `providerRef`. Unexpected errors are logged and return 500.
- The logger calls carry `Stryker disable` comments, which exclude them from mutation testing.
