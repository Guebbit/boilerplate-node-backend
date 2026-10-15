---
source: src/modules/payments/services/retention.ts
sha256: 0ee519cab535fcf0dda753924241ff46bcd8323e87042cc3387a9bd94dfb139d
generated_at: 2026-10-15T11:31:35.608030+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/services/retention.ts

## Purpose

Post-transaction lifecycle operations for payments: detaching a user's identity at erasure, assembling the account's full payment history for data export, and sweeping out abandoned (never-succeeded) payment attempts past a retention window.

## Key elements

- **`detachUserId(userId, session)`** — Erasure hook. Unsets `userId` on every payment the account made. Joins the caller's `ClientSession` transaction. Logs only when `detached > 0`.
- **`findOwnPayments(userId)`** — Reads **all** payments for the user via `readAll` (intentionally unpaginated). Returns `Lean<PaymentDocument>[]`.
- **`toExportPayment(payment)`** *(private)* — Maps a `Lean<PaymentDocument>` to the public `ExportPayment` shape. Deliberately omits `userId` and conditionally includes `cardLast4`, `createdAt`, `updatedAt`, and per-refund `returnId`/`settledAt`.
- **`findOwnPaymentsForExport(userId)`** — Composes `findOwnPayments` + `toExportPayment`; the exported entry point for the data-export route.
- **`reapAbandonedPayments()`** — Computes a cutoff from `abandonedPaymentRetentionDays()`, delegates to `paymentRepository.deleteAbandonedBefore`, returns the deleted count. Logs only when `deleted > 0`.

## Relationships

- **`../repository.ts`** — Primary data access: `detachUserId`, `findAll` + `ownerScope`, `deleteAbandonedBefore`.
- **`../config.ts`** — Supplies `abandonedPaymentRetentionDays` for the reap cutoff.
- **`../model.ts`** — Provides the `PaymentDocument` type used in signatures and mapping.
- **`@infrastructure/persistence/search.ts`** — `readAll` and `MAX_CONFIGURED_PAGE_SIZE` drive the unpaginated export read.
- **`@infrastructure/persistence/create-repository.ts`** — Source of the `Lean<T>` type.
- **`@infrastructure/adapters/logger.ts`** — Structured info logging on detach and reap (guarded by Stryker mutation-disable comments).
- **`@types/index.ts`** — Defines `ExportPayment` and `Refund` shapes used by the export mapper.
- **`../services/index.ts`** — Barrel re-export of the public functions.
- **`../module.ts`** — Consumes the exported functions for route wiring (the field mapping lives here, not in `module.ts`).
- **`../tests/integration/retention.test.ts`** — Integration coverage for all exported operations.

## Notes

- `findOwnPayments` uses `readAll` on purpose — an export is a one-shot full answer, not a paginated listing. Do not "fix" this to a single-page query.
- `toExportPayment` is a hand-written mapper (not a type-level `Omit`) because `applyPaymentTransform` does not strip `userId`; returning the Mongoose document directly would leak it.
- `reapAbandonedPayments` only targets attempts that **never reached `succeeded`**; settled payments are never candidates.
- The retention window is env-configurable (`NODE_PAYMENT_ABANDONED_RETENTION_DAYS`, default 30).
- Stryker mutation-testing disable/restore comments wrap the logger calls — remove them only if you understand the mutation-testing setup.
