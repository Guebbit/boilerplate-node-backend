---
source: src/modules/payments/services/retention.ts
sha256: 70705d9f06e6f2af6f328dc836723d829b83b64dcb99636e7d1944d39d74af4e
generated_at: 2026-09-23T19:21:54.837576+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/services/retention.ts

## Purpose

Handles the post-transaction lifecycle of payments: detaching payment rows from erased accounts, producing a user's full payment export, and sweeping payment attempts that were abandoned before settling. It is the "cleanup and accountability" counterpart to the core payment-creation flow.

## Key elements

- **`detachUserId(userId)`** — Unsets `userId` on all payments belonging to an erased account. The payment documents remain; ownership is simply nulled. Logs at `info` level when rows were affected.
- **`findOwnPayments(userId)`** — Returns all payments for a given user as `Lean<PaymentDocument>[]`. Uses `readAll` to internally page through results, presenting a single unpaginated array to the caller.
- **`reapAbandonedPayments()`** — Deletes payment attempts older than a configurable cutoff that never reached `succeeded` or `refunded`. Returns the count of deleted rows. Intended to be invoked by the `scripts/ops/reap-payments.ts` ops script.

## Relationships

- **`src/modules/payments/repository.ts`** — All three functions delegate to `paymentRepository` methods (`detachUserId`, `findAll`, `deleteAbandonedBefore`).
- **`src/modules/payments/model.ts`** — Imports `PaymentDocument` for the return type of `findOwnPayments`.
- **`src/infrastructure/persistence/search.ts`** — Imports `readAll` and `MAX_CONFIGURED_PAGE_SIZE` to implement the internal pagination in `findOwnPayments`.
- **`src/infrastructure/persistence/create-repository.ts`** — Imports the `Lean` type used to strip heavy fields from export results.
- **`src/infrastructure/adapters/logger.ts`** — Imports `logger` for `info`-level audit logging in `detachUserId` and `reapAbandonedPayments`.
- **`src/infrastructure/runtime/environment.ts`** — Imports `environmentNumber` to read `NODE_PAYMENT_ABANDONED_RETENTION_DAYS`.
- **`src/modules/payments/services/index.ts`** — Barrel file that re-exports these three functions for consumers of the payments module.
- **`src/modules/payments/module.ts`** — Wires this service into the module's public surface.
- **`src/modules/payments/tests/integration/retention.test.ts`** — Integration tests exercising the three exported functions against a live database.

## Notes

- **Settled payments are never reaped.** `reapAbandonedPayments` only targets rows that never reached `succeeded` or `refunded`. A settled payment is excluded regardless of age. See `docs/modules/payments.md` for the full retention policy.
- **`findOwnPayments` is deliberately unpaginated.** The caller receives the complete set in one call; internal paging via `readAll` is an implementation detail, not a contract the caller controls.
- **Mutation-testing exclusions.** `Stryker disable` comments guard the logging branches so that mutated log calls don't produce false-positive test failures.
- **Retention minimum is 1 day.** The `environmentNumber` call passes `1` as a floor, preventing a misconfiguration from deleting payments less than a day old.
