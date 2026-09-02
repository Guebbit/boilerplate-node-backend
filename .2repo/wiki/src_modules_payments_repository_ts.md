# src/modules/payments/repository.ts

## Purpose

Payment data-access layer: standard CRUD (via a shared factory) plus the payment-specific lookups and guarded writes that the payments service needs. It owns scoping to a caller's rows, the intent upsert, the status-machine transition primitive, and account-erasure detachment — all as a single exported object.

## Key elements

- **`paymentRepository`** — the sole export. Spreads `createRepository<PaymentDocument>(paymentModel, { transform: applyPaymentTransform })` for generic CRUD, then adds domain-specific methods. Its type is written out explicitly because Mongoose's generics exceed TypeScript's inference limit at an export boundary (TS7056).
- **`ownerScope(userId)`** — returns a filter fragment `{ userId: ObjectId }` to spread into a query; pass `undefined` for admin/unscoped access.
- **`findByIdScoped(paymentId, scope?)`** — fetch one payment by `_id` with optional ownership filter applied *in the query*, not post-read.
- **`findByOrderId(orderId, scope?)`** — same pattern, keyed on `orderId`.
- **`upsertIntent(orderId, userId, data)`** — single `findOneAndUpdate` with `upsert: true`. The `$in` status guard (`requires_confirmation`, `declined`) ensures a re-ask only fires before money has moved. Catches MongoDB duplicate-key error (code 11000) and returns `null` instead of throwing — that collision *is* the "already paid" answer. When `userId` is `undefined`, `$setOnInsert` omits the field entirely.
- **`updateStatusIfIn(orderId, from, to, extra?)`** — atomic guarded transition; the `from` array goes into the filter so only one of two racing writers matches.
- **`detachUserId(userId)`** — `$unset` the `userId` field on all of an erased account's payments; returns `modifiedCount`. No timestamps update.

## Relationships

- **`src/infrastructure/persistence/create-repository.ts`** — supplies the base `createRepository` factory, the `Repository<T>` type, and the `toObjectId` helper used throughout.
- **`src/modules/payments/model.ts`** — provides `paymentModel` (the Mongoose model) and `applyPaymentTransform` (field mapping applied to results by the base CRUD methods).
- **`src/types/index.ts`** — source of the `PaymentStatus` union type used in `updateStatusIfIn`'s signature.
- **`src/modules/payments/service.ts`** — the primary consumer; the comment block explicitly names "the intent/status writes the service depends on."
- **`src/modules/payments/tests/integration/service.test.ts`** and **`retention.test.ts`** — integration tests that exercise these methods end-to-end.

## Notes

- Scoping is always applied **inside the MongoDB filter** (spread as `{ ...scope }`), never checked after the read. The file's comments call out that a post-read ownership check creates an information-leak window.
- The `unique` index on `orderId` is the single source of truth for "one payment per order." The upsert relies on that index for its duplicate-key collision rather than doing a read-then-write.
- `detachUserId` uses `{ timestamps: false }` on `updateMany` to avoid bumping `updatedAt` during bulk erasure.
- The `userId` field can be absent (not `null`): `upsertIntent` intentionally omits it when the caller's account is already erased, so the payment still records the transaction with no payer reference.
