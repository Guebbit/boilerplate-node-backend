---
source: src/modules/payments/services/retention.ts
source_sha256: adc8fd9da0a9c1bd0487581882c642dab558dceb38cab0f969f1fd0e7b4a4dae
context_sha256: 03d831d6f9d977722fa2d218b5c8adf7bc5fb2aa63e224861bfeb2c4c5bc433a
generated_at: 2026-11-22T06:53:02.897011+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/services/retention.ts

## Purpose
Handles a payment's lifecycle after the money has moved. It covers three things: detaching an erased account from its payments, producing an account's own payment data for export, and sweeping away abandoned payment attempts.

## Key elements
- **`detachUserId(userId, session)`**: the `personalData.erase` hook. Calls `paymentRepository.detachUserId` inside the caller's `ClientSession`, which unsets `userId` on the account's payments. The payment rows are not deleted. It logs an info message when at least one payment was detached.
- **`findOwnPayments(userId)`**: returns every payment the account made, unpaginated. It uses `readAll` to page through `paymentRepository.findAll(paymentRepository.ownerScope(userId), …)` in pages of `MAX_CONFIGURED_PAGE_SIZE`.
- **`toExportPayment`** (private): maps a lean payment document to an `ExportPayment`.
  - It omits `userId`.
  - It formats amounts with `padDecimal`.
  - It maps refunds to `Refund` objects.
  - It converts dates to ISO strings.
  - Optional fields (`returnId`, `settledAt`, `cardLast4`, `createdAt`, `updatedAt`) are included only when present.
- **`findOwnPaymentsForExport(userId)`**: `findOwnPayments` followed by `toExportPayment`, for the account data export.
- **`reapAbandonedPayments()`**: the sweep for `reap:payments`. It computes two cutoffs and calls `paymentRepository.deleteAbandonedBefore(cutoff, transferCutoff)`. It logs when anything was deleted and returns the number of rows deleted.

## Relationships
- **`../repository`**: `paymentRepository` supplies `detachUserId`, `findAll`, `ownerScope` and `deleteAbandonedBefore`. All database access goes through it.
- **`../model`**: provides the `PaymentDocument` type.
- **`@infrastructure/persistence/create-repository`**: provides the `Lean` type.
- **`@infrastructure/persistence/search`**: provides `readAll` and `MAX_CONFIGURED_PAGE_SIZE` for the export read.
- **`../config`**: provides `abandonedPaymentRetentionDays()` and `TRANSFER_PAYMENT_RETENTION_DAYS` for the reaper's cutoffs.
- **`@domain-primitives/money`**: `padDecimal` formats amounts by currency.
- **`@domain-primitives/time`**: `DAY_MS` converts retention days to milliseconds.
- **`@infrastructure/adapters/logger`**: used for the detach and delete log lines.
- **`@types`**: provides the `ExportPayment` and `Refund` shapes.

## Notes
- `userId` is left out of exports because the query already scopes results to the caller. `applyPaymentTransform` does not omit it, so returning the raw document would still serialize `userId`. That is why `toExportPayment` builds a plain object.
- The reaper targets only payments that never reached `succeeded` and have not been touched within the retention window. Settled payments are never candidates. Bank-transfer attempts are kept longer, so a late transfer can still be matched.
- The retention window comes from `NODE_PAYMENT_ABANDONED_RETENTION_DAYS`, read through `abandonedPaymentRetentionDays()`. The transfer window is the fixed constant `TRANSFER_PAYMENT_RETENTION_DAYS`.
- The `// Stryker disable` comments around the logging exclude those lines from mutation testing.
