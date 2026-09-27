---
source: src/modules/payments/repository.ts
sha256: d1ae8d68865c3d3649a97dd3eae54c2b640f4118b25caa02afa5f42dc10160d2
generated_at: 2026-09-27T15:25:30.799745+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/repository.ts

## Purpose

Data-access layer for the payments aggregate. Wraps the shared `createRepository` factory with domain-specific lookups and guarded writes (intent upsert, offline upsert, status transitions, retention sweeps). Exists so service-layer code never touches Mongoose directly and all ownership scoping, idempotency, and duplicate-key semantics live in one place.

## Key elements

- **`PaymentWire`** (exported type) – The wire shape for payment documents; omits `providerRef` and `pendingEffects` (internal bookkeeping never part of the external contract).
- **`paymentRepository`** (main export) – A `Repository<PaymentDocument, PaymentWire>` augmented with:
  - `ownerScope(userId)` – Returns a filter fragment `{ userId }` for scoping queries to one user's rows.
  - `findByIdScoped` / `findByOrderId` – Single-document reads with optional caller scope spread into the filter (not a post-read check).
  - `findByProviderRef` – The **only unscoped** read in the repository; used by the webhook path where no logged-in caller exists.
  - `attachProviderRef` – Conditionally sets `providerRef` only if it is still absent (makes re-preparation idempotent).
  - `upsertIntent(orderId, userId, data)` – Creates or refreshes a card-intent row; resets to `requires_confirmation`. Returns `null` on duplicate-key (order already paid).
  - `upsertOffline(orderId, userId, data)` – Same mechanics as `upsertIntent` but for manual/offline payments; unsets `providerRef` and `cardLast4`.
  - `updateStatusIfIn(orderId, from[], to, extra?)` – Status-machine transition guarded by `$in` on current status; exactly one of two racing writes matches.
  - `detachUserId(userId, session?)` – `$unset`s `userId` on all of an account's payments (PII erasure); returns count.
  - `deleteAbandonedBefore(cutoff)` – Deletes non-settled payments untouched since before `cutoff`; `succeeded`/`refunded` are never deleted.
  - `clearPendingEffects(orderId)` – Unsets the `pendingEffects` marker (effect ran or order cancelled).
  - `findWithPendingEffects(updatedBefore, limit)` – Returns payments still owing an effect, oldest first, excluding those touched in the current sweep tick.
- **`upsertConfirmable`** (private helper) – Shared `findOneAndUpdate` + upsert logic for `upsertIntent` and `upsertOffline`; filters to `CONFIRMABLE_PAYMENT_STATUSES` and maps duplicate-key errors to `null`.

## Relationships

- **`create-repository.ts`** – Supplies the `createRepository` factory (base CRUD, `findById`, `findAll`, `create`, `update`, `delete`), `toObjectId`, and the `Repository`/`Wire` generic types that `paymentRepository` extends.
- **`mongo-errors.ts`** – Provides `isDuplicateKey`; the repository catches duplicate-key errors on the unique `orderId` index and returns `null` instead of throwing.
- **`model.ts`** – Provides `paymentModel`, `paymentWebhookEventModel`, `applyPaymentTransform` (wired as the repository's transform), `CONFIRMABLE_PAYMENT_STATUSES`, and the `PaymentDocument` interface.
- **`services/intent.ts`** – Calls `upsertIntent` and `attachProviderRef` when preparing a card payment.
- **`services/offline.ts`** – Calls `upsertOffline` when recording a manual payment.
- **`services/settlement.ts`** – Calls `updateStatusIfIn` to move a payment to `succeeded` and `clearPendingEffects` once the effect lands.
- **`services/effects.ts`** – Calls `findWithPendingEffects` to scan for stuck settlements and `clearPendingEffects` on completion.
- **`services/retention.ts`** – Calls `deleteAbandonedBefore` as part of its scheduled sweep.
- **`services/refunds.ts`** – Calls `updateStatusIfIn` to transition a payment to `refunded`.
- **`services/view.ts`** – Calls `findByIdScoped` / `findByOrderId` to read payment data for API responses.
- **`@types` (`types/index.ts`)** – Source of `PaymentStatus` and `PaymentMethod` enum values used in filters and payloads.
- **Tests** – `api.contract.test.ts`, `retention.test.ts`, `service.test.ts`, and `refunds.test.ts` exercise the repository's methods (directly or via their calling services).

## Notes

- **Duplicate key = meaningful `null`.** The unique index on `orderId` makes "one payment per order" a database fact. A duplicate-key error in `upsertIntent`/`upsertOffline` is caught and returned as `null`—it signals "this order's money already moved," not a failure.
- **Scoping is in the filter, never post-read.** `findByIdScoped` and `findByOrderId` spread the caller's scope into the `findOne` filter. Checking ownership after the read would create a TOCTOU window.
- **`findByProviderRef` is deliberately unscoped.** Webhook deliveries have no logged-in user; authentication is the signature check performed before this method is reached.
- **`attachProviderRef` is idempotent.** The filter includes `providerRef: { $exists: false }`, so a racing second request finds nothing to write and reads back the already-attached reference.
- **`upsertOffline` clears card fields.** It unsets `providerRef` and `cardLast4`, ensuring a manual payment record carries no stale card metadata.
- **`detachUserId` ≠ deletion.** Settled payments (`succeeded`, `refunded`) are kept forever as invoices; this method only strips the user link. `deleteAbandonedBefore` is the separate path that removes non-settled attempts.
- **Explicit return type annotation.** The `paymentRepository` type is written out by hand because Mongoose's generic inference exceeds TypeScript's ability at an export boundary (TS7056).
