# src/modules/payments/repository.ts

## Purpose

Data-access layer for the payments module. Spreads the shared repository factory for standard CRUD, then adds two domain-specific reads (by order, by id) and two guarded writes (intent upsert, status transition) that the payment service depends on. All ownership scoping is enforced inside the query filter rather than checked after retrieval.

## Key elements

- **`paymentRepository`** (sole export) — object conforming to `Repository<PaymentDocument>` plus five domain methods:
  - **`ownerScope(userId)`** — returns `{ userId: ObjectId }` for spread into a filter; pass `undefined` for admin (unscoped).
  - **`findByIdScoped(paymentId, scope?)`** — `findOne` by `_id` with an optional scope filter.
  - **`findByOrderId(orderId, scope?)`** — `findOne` by `orderId` with an optional scope filter.
  - **`upsertIntent(orderId, userId, { amount, currency, provider })`** — atomic `findOneAndUpdate` with `upsert: true`; filter restricts to `status: { $in: ['requires_confirmation', 'declined'] }`. Returns `null` on duplicate-key (code 11000) — the unique index on `orderId` is the "money already moved" signal.
  - **`updateStatusIfIn(orderId, from, to, extra?)`** — atomic `findOneAndUpdate` whose filter includes `status: { $in: from }`, so only one of two racing writers can match.

## Relationships

- **`src/infrastructure/persistence/create-repository.ts`** — supplies the `createRepository` factory (spread for standard CRUD) and the `toObjectId` helper used throughout.
- **`src/modules/payments/model.ts`** — provides `paymentModel` (the Mongoose model) and `applyPaymentTransform` (wired into the base repository's transform).
- **`src/modules/payments/service.ts`** — the primary consumer; calls every method on `paymentRepository`.
- **`src/types/index.ts`** — source of the `PaymentStatus` type used in the `updateStatusIfIn` signature.
- **`src/modules/payments/tests/integration/service.test.ts`** — integration tests that exercise this repository through the service.

## Notes

- The return type of `paymentRepository` is spelled out explicitly at the export boundary; Mongoose's generic inference is too large for TypeScript to resolve (error TS7056).
- `upsertIntent` intentionally catches and converts MongoDB error `11000` to `null` instead of throwing — callers treat `null` as "this order's payment already progressed past the upsert-eligible states."
- Scoping is applied in the query filter (not as a post-read check) to close the TOCTOU window between reading a row and verifying ownership.
- The status-machine guard (`$in` in the filter) is the concurrency control: two racing `updateStatusIfIn` calls with disjoint `from` arrays can both succeed at the Mongoose level, but the `$in` filter guarantees at most one document matches.
