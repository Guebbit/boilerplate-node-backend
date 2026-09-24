---
source: src/modules/payments/repository.ts
sha256: 51a712c64164b4858b8f1b8911001edd1dc71ac070360d7a4a762612ddf7ec2d
generated_at: 2026-09-23T19:20:23.333314+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/repository.ts

## Purpose

Defines the payment repository: the standard CRUD layer (via the shared factory) plus the two scoped reads and the guarded writes that payment services actually perform. It centralises concurrency safety (status-`$in` filters, conditional writes, unique-index collisions) so that service code can rely on a single atomic `findOneAndUpdate` rather than a read-then-write sequence.

## Key elements

- **`PaymentWire`** – Wire DTO type; `Omit<Wire<PaymentDocument>, 'providerRef'>` because `providerRef` is a provider-internal id, never part of the API contract.
- **`paymentRepository`** – The main export. Spreads `createRepository(paymentModel, { transform: applyPaymentTransform })` and adds:
  - `ownerScope(userId)` – returns a filter fragment (`{ userId: ObjectId }`) to spread into a query; `undefined` means admin.
  - `findByIdScoped` / `findByOrderId` – scoped reads (scope merged into the filter, not checked post-read).
  - `findByProviderRef` – the only **unscoped** read; called by webhook handlers where no user identity exists.
  - `attachProviderRef` – conditional `$set` guarded by `providerRef: { $exists: false }`; a losing racer reads back the winner's value.
  - `upsertIntent` – upsert keyed on `orderId`; filter restricts to `requires_confirmation | declined`; duplicate-key is caught and surfaced as `null` (meaning "money already moved").
  - `upsertOffline` – same guard shape for manual/offline payments; `$unset` clears `providerRef`/`cardLast4`; leaves status at `requires_confirmation` (settlement is a separate step).
  - `updateStatusIfIn` – the status-machine primitive; `$in` in the filter makes exactly one of two racing writes match.
  - `detachUserId` – `$unset: userId` on all rows for an erased account; `{ timestamps: false }` so `updatedAt` is not bumped.
  - `deleteAbandonedBefore` – retention sweep; deletes rows not in `succeeded|refunded` whose `updatedAt ≤ cutoff`.
- **`claimWebhookEvent(eventId)`** – insert-into-`paymentWebhookEventModel` as an idempotency check; duplicate-key → `false` (retry, answer 2xx and do nothing).
- **`releaseWebhookEvent(eventId)`** – compensating delete so a failed settlement's next redelivery is acted on.

## Relationships

- **`src/infrastructure/persistence/create-repository.ts`** – supplies `createRepository`, `toObjectId`, `Repository`, and `Wire`; the base CRUD is spread into `paymentRepository`.
- **`src/infrastructure/persistence/mongo-errors.ts`** – `isDuplicateKey` is used to convert duplicate-key exceptions into domain answers (`null` / `false`) instead of rethrowing.
- **`src/modules/payments/model.ts`** – provides `paymentModel`, `paymentWebhookEventModel`, `applyPaymentTransform`, and the `PaymentDocument` type.
- **`src/types/index.ts`** – `PaymentStatus` and `PaymentMethod` enums used in filters and writes.
- **Services** (`intent.ts`, `offline.ts`, `refunds.ts`, `retention.ts`, `settlement.ts`, `view.ts`) – the primary consumers; each calls a subset of the domain methods above.
- **Tests** (`api.contract.test.ts`, `retention.test.ts`, `service.test.ts`) – exercise the repository contract and integration behaviour.

## Notes

- **Scope-in-the-filter, not post-read.** `findByIdScoped`/`findByOrderId` merge the user scope into the Mongo filter. Checking ownership after the read would create an information-leak window.
- **Duplicate-key as answer, not error.** `upsertIntent`/`upsertOffline`/`claimWebhookEvent` catch `isDuplicateKey` and return a domain value (`null`/`false`). Callers should not wrap these in `try/catch` expecting an exception for the "already settled" case.
- **Status guard is the concurrency mechanism.** The `$in: ['requires_confirmation', 'declined']` filter (not an application-level lock) is what prevents overwriting a confirmed/refunded payment.
- **`providerRef` is invisible to the wire type.** Any code that serialises a payment for the API will not see it; webhook code accesses it via `findByProviderRef` or the document directly.
- **`detachUserId` skips `timestamps`.** Omitting the timestamp update keeps `updatedAt` stable so the retention sweep (`deleteAbandonedBefore`) can still find old abandoned rows.
- **`succeeded`/`refunded` are never deleted by the retention sweep.** They are treated as invoices, distinct from abandoned attempts.
- **Explicit return type on `paymentRepository`.** Written out by hand because Mongoose's generic inference exceeds TypeScript's limits at an export boundary (TS7056).
