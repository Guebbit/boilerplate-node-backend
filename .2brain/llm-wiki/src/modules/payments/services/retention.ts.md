---
source: src/modules/payments/services/retention.ts
sha256: 19aa7da7c4e73632fe258d087350256d8691da8c01339b007e439b29b29c8095
generated_at: 2026-11-08T07:29:12.993673+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/services/retention.ts

## Purpose

Handles the post-movement lifecycle of payment records: detaching a user's ID during account erasure, producing an account's own payment data for export, and sweeping (deleting) abandoned payment attempts that never succeeded. It does not create, charge, or settle payments — it manages what happens to the row after the money event.

## Key elements

- **`detachUserId(userId, session)`** — Unsets `userId` on every payment belonging to the given account, joined to the caller's hard-delete transaction via a Mongoose `ClientSession`. Logs the detach count.
- **`findOwnPayments(userId)`** — Reads all payments for an account via `readAll` (unpaginated by design; an export is a one-time full result). Returns `Lean<PaymentDocument>[]`.
- **`toExportPayment(payment)`** *(private)* — Maps a `Lean<PaymentDocument>` to the public `ExportPayment` shape. Deliberately omits `userId`, formats amounts with `padDecimal`, serializes dates to ISO strings, and conditionally includes optional fields (`cardLast4`, `returnId`, `settledAt`, `createdAt`, `updatedAt`).
- **`findOwnPaymentsForExport(userId)`** — Convenience wrapper: `findOwnPayments` → `toExportPayment` mapping. Returns `ExportPayment[]`.
- **`reapAbandonedPayments()`** — Deletes payment attempts that never reached `succeeded` and are older than `abandonedPaymentRetentionDays()` (default 30 days). Bank-transfer rows use a longer `TRANSFER_PAYMENT_RETENTION_DAYS` cutoff so late transfers can still be matched. Returns the deletion count; logs when > 0.

## Relationships

- **`../repository`** — All reads/deletes go through `paymentRepository` (`detachUserId`, `findAll`, `ownerScope`, `deleteAbandonedBefore`). This file contains no raw Mongo calls.
- **`../config`** — Supplies the two retention day-counts used by `reapAbandonedPayments`.
- **`../model`** — Provides the `PaymentDocument` type that shapes the internal read.
- **`@types`** — Provides the public `ExportPayment` and `Refund` shapes that the export mapping produces.
- **`@domain-primitives/money`** — `padDecimal` formats amount/amountRefunded/refund amounts.
- **`@domain-primitives/time`** — `DAY_MS` converts retention day-counts into a millisecond cutoff.
- **`@infrastructure/adapters/logger`** — Structured info logs on detach and reap.
- **`@infrastructure/persistence/search`** — `readAll` + `MAX_CONFIGURED_PAGE_SIZE` power the unpaginated export read.
- **`@infrastructure/persistence/create-repository`** — Source of the `Lean<T>` type alias used in signatures.
- **`../services/index.ts`** — Barrel that re-exports this module's public API.
- **`src/modules/payments/jobs.ts`** — Expected caller of `reapAbandonedPayments` as a scheduled sweep.

## Notes

- `toExportPayment` builds a **real plain object**, not a type-level `Omit` on the Mongoose document, so `userId` is absent at runtime rather than merely hidden by a type.
- The `readAll` call in `findOwnPayments` is intentionally unpaginated; do not add a page-size limit without understanding the export contract.
- Stryker mutation-testing `disable`/`restore` comments wrap the logger calls — keep them if you touch those lines.
- Settled/succeeded payments are **never** candidates for `reapAbandonedPayments`; the repository method enforces the status filter.
- Transfer payments are kept longer than card payments by design (late bank transfers can still be matched); the two cutoffs are computed separately.
