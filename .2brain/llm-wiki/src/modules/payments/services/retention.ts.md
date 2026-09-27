---
source: src/modules/payments/services/retention.ts
sha256: 278d57694d603c926d0c5f6a43867a7a53d9e3417a56f61ec2de1a10ae1a4a25
generated_at: 2026-09-27T15:27:14.465174+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/services/retention.ts

## Purpose
Handles the payment lifecycle after money has moved: identity detachment on account erasure, full-payment retrieval for the account's own data export, and a sweep that deletes abandoned (never-settled) payment attempts past a retention window.

## Key elements
- **`detachUserId(userId, session)`** — DDD-D6 `personalData.erase` hook. Unsets `userId` on all payments belonging to the erased account. Joins the caller's hard-delete transaction via the `ClientSession` parameter.
- **`findOwnPayments(userId)`** — Returns *all* payments for a user. Deliberately unpaginated (uses `readAll` internally) because it serves a one-time full export, not a client-facing listing.
- **`toExportPayment(payment)`** *(private)* — Maps a `Lean<PaymentDocument>` to the public `ExportPayment` shape. Explicitly omits `userId`, spreads `cardLast4` and timestamps conditionally, and returns a plain object (not a type-level `Omit`) so serialization cannot leak `userId`.
- **`findOwnPaymentsForExport(userId)`** — Composes `findOwnPayments` + `toExportPayment`. The field mapping formerly inlined in `module.ts`.
- **`reapAbandonedPayments()`** — Deletes payment attempts that are not in `succeeded`/`refunded` status and whose last modification is older than `NODE_PAYMENT_ABANDONED_RETENTION_DAYS` (default 30, min 1). Returns the count deleted.

## Relationships
- **`paymentRepository`** (`../repository`) — All reads and writes go through it (`detachUserId`, `findAll` with `ownerScope`, `deleteAbandonedBefore`).
- **`readAll` / `MAX_CONFIGURED_PAGE_SIZE`** (`@infrastructure/persistence/search`) — Drives the unpaginated full-read in `findOwnPayments`.
- **`environmentNumber`** (`@infrastructure/runtime/environment`) — Resolves the retention-days threshold at call time.
- **`logger`** (`@infrastructure/adapters/logger`) — Emits info logs when detach or reap operations affect > 0 rows.
- **`PaymentDocument`** (`../model`) — Type used for the document-to-export mapping.
- **`ExportPayment`** (`@types`) — The public export shape returned by `findOwnPaymentsForExport`.
- **`module.ts`** — Likely registers these functions as the module's service surface (the doc comment notes the mapping was moved *from* `module.ts`).
- **`services/index.ts`** — Re-exports the public functions from this file.
- **`retention.test.ts`** — Integration tests exercising the three public operations.

## Notes
- `toExportPayment` builds a fresh plain object rather than relying on `Omit`/`Pick` on the Mongoose document. The code comment explains that `applyPaymentTransform` does not carry the omission, so returning the document as-is would still serialize `userId`.
- `detachUserId` participates in the caller's MongoDB transaction; it must not be called standalone outside that session.
- The Stryker disable/restore comments wrap the `logger.info` call in `detachUserId` to suppress mutation-testing on a pure side-effect line.
- A settled payment (`succeeded` or `refunded`) is never a candidate for `reapAbandonedPayments`, regardless of age.
