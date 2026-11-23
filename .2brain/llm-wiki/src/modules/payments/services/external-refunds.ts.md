---
source: src/modules/payments/services/external-refunds.ts
source_sha256: bd412a1c8f68c2bed66486c3331af603f91f96e8697e5c503bed96dd907e1400
context_sha256: 59d8df1d88a9a39554c57753ef7b6176848383ad8f43f7a67655af7d0868edc0
generated_at: 2026-11-22T06:50:26.663345+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/services/external-refunds.ts

## Purpose
Handles refunds made directly in the payment provider's dashboard. On a refund event, it lists the intent's refunds at the provider and walks them: refunds that match one of our records are carried onto that record, and unknown refunds that succeeded are imported as settled records. This way the credit note, buyer mail and order stamp follow as for any other refund.

## Key elements
- `syncProviderRefunds(payment)` (exported): resolves the provider from the registry, calls `listRefunds(providerRef)`, and processes each refund sequentially. Each step works on the payment the previous step left. It does nothing if there is no provider or `providerRef`.
- `syncRefunds(paymentId, authContext)` (exported): handler for `POST /payments/:id/refunds/sync`, the staff "Re-sync refunds" action. It reads the payment with the caller's scope and returns a 404 via `paymentNotFound()` if it is missing. If the payment is not in `REFUNDABLE_PAYMENT_STATUS`, it returns it unchanged with 200. Otherwise it runs the sync and returns the re-read payment.
- `syncOne` (internal): handles one provider refund.
  - If it is ours, it calls `applyRefundState`.
  - If it is outside and not `succeeded`, it is skipped.
  - If it is in another currency, it is announced as unrecorded, not imported.
  - Otherwise it is imported.
- `ourRecord`: matches a provider refund to a record by stored `providerRefundRef`, or by our record id echoed back as `refundId`.
- `importedRecord`: builds the settled record, with status `succeeded`, reason `'external'` and idempotency key `import:<refundRef>`.
- `writeImport`: runs in one transaction. It conditionally appends the record and the new running total via `paymentRepository.importRefund`. If that succeeds, it stamps the order and appends `refund_issued` and `refund_settled` timeline rows.
- `importRefund`: wraps `writeImport` in `announceInTransaction`, emitting `PAYMENT_REFUNDED`. A miss means a duplicate delivery or a moved total, so it re-reads the payment. If the refund is already recorded, it returns the fresh payment. Otherwise it retries up to `MAX_IMPORT_ATTEMPTS` (3) times, then announces `lost_race`.
- `announceUnrecorded`: emits `PAYMENT_REFUND_UNRECORDED` (reason `lost_race` or `other_currency`) in its own transaction, as a staff to-do.

## Relationships
- `../providers/registry` (`paymentProviderRegistry`) and `../providers` (`ProviderRefund`): resolve the provider and supply the refund data.
- `../repository` (`paymentRepository`): `importRefund`, `findById` and `findByIdScoped`.
- `./refund-settlement`: `refundRow`, `refundedPayload` and `stampOrder` are reused for the timeline data, event payload and order stamp.
- `./errors` (`paymentNotFound`): the 404 response.
- `@modules/orders` (`src/modules/orders/index.ts`): supplies `orderService`, used to append the order timeline rows.
- `@kernel/outbox` (`announceInTransaction`): transactional event publishing.
- `../events`: `PAYMENT_REFUNDED` and `PAYMENT_REFUND_UNRECORDED`.
- `../model` and `../domain`: `PaymentDocument` and `RefundRecord` types, and `REFUNDABLE_PAYMENT_STATUS`.
- `@domain-primitives/money`: computes the new `amountRefunded` total in minor units.
- `@infrastructure/http/response`: `generateSuccess` and the response types.
- `@infrastructure/adapters/logger`: warns when an outside refund is imported.

## Notes
- The import always records, even above the amount paid, because the money has already moved.
- Idempotency comes from the conditional write in `importRefund` and the `providerRefundRef` check on re-read.
- Currencies are never converted. A refund in another currency is only announced for staff to record.
- Pending or failed outside refunds are skipped. A later event reporting success imports them.
- The webhook still answers 204 when a refund cannot be recorded, because a provider retry cannot fix either cause.
- The header mentions an open app record that no longer fits being held unsent (`exceedsRemaining`). That logic is not in this file.
- The file also imports `applyRefundState` from `./refund-sync` (used for refunds that are already ours) and `callerScope` from `./scope` (the caller's access scope); neither file is among the listed graph neighbors.
