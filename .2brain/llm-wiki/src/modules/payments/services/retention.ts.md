---
source: src/modules/payments/services/retention.ts
sha256: a0857217aed57c633fbe1043b4ff1cf88c762c9eddbd04a637292df35a75e75c
generated_at: 2026-10-29T05:13:27.645657+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/services/retention.ts

## Purpose

Handles the post-transaction lifecycle of payments: detaching `userId` when an account is erased, producing the account's full payment export, and sweeping out abandoned (never-succeeded) payment attempts past their retention window.

## Key elements

- **`detachUserId(userId, session)`** — Erasure hook. Unsets `userId` on all payments made by the account; joins the caller's hard-delete transaction via the Mongoose `ClientSession`.
- **`findOwnPayments(userId)`** — Returns every payment for the owner as `Lean<PaymentDocument>[]`. Uses `readAll` internally (internally paginated, externally unpaginated) because an export is a one-time full answer.
- **`toExportPayment(payment)`** *(private)* — Maps a `Lean<PaymentDocument>` to the public `ExportPayment` shape, explicitly omitting `userId` and converting sub-document refs (`refunds`, optional `cardLast4`, timestamps) to plain serializable values.
- **`findOwnPaymentsForExport(userId)`** — Convenience wrapper: `findOwnPayments` → `toExportPayment` per row.
- **`reapAbandonedPayments()`** — Deletes payment attempts that never reached `succeeded` and are older than the configured retention (default 30 days). Bank-transfer rows use a longer cutoff (`TRANSFER_PAYMENT_RETENTION_DAYS`) so late transfers can still be matched. Returns the deletion count.

## Relationships

- **`src/modules/payments/repository.ts`** — All data access (`detachUserId`, `findAll`, `deleteAbandonedBefore`) goes through `paymentRepository`.
- **`src/modules/payments/model.ts`** — `PaymentDocument` type shapes the internal read results.
- **`src/modules/payments/config.ts`** — Supplies `abandonedPaymentRetentionDays` and `TRANSFER_PAYMENT_RETENTION_DAYS` retention constants.
- **`src/infrastructure/persistence/search.ts`** — Provides `readAll` and `MAX_CONFIGURED_PAGE_SIZE` for the internally-paginated, externally-unpaginated export read.
- **`src/infrastructure/persistence/create-repository.ts`** — Source of the `Lean<T>` document type used for read results.
- **`src/infrastructure/adapters/logger.ts`** — Emits `info`-level entries on detach and reap when rows are affected.
- **`src/domain-primitives/time.ts`** — `DAY_MS` constant for computing date cutoffs.
- **`src/types/index.ts`** — `ExportPayment` and `Refund` public API types.
- **`src/modules/payments/jobs.ts`** — Schedules `reapAbandonedPayments` as the `reap:payments` periodic job.
- **`src/modules/payments/services/index.ts`** — Barrel re-exports the public functions of this module.

## Notes

- `toExportPayment` manually omits `userId` rather than relying on a type-level `Omit`; the Mongoose document's own serializer would still emit the field, so the explicit pick is intentional.
- The export path is deliberately **unpaginated** from the caller's perspective. Do not add pagination without a product decision.
- Settled/succeeded payments are never candidates for reaping regardless of age—only non-`succeeded` attempts are eligible.
- Stryker mutation-testing is disabled on the `logger.info` lines (they have no observable side-effect beyond logging).
