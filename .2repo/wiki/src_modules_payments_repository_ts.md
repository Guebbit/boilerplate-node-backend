# src/modules/payments/repository.ts

## Purpose

Data-access layer for the payments domain. Wraps the Mongoose `paymentModel` with ownership-scoped reads, an atomic intent upsert, and a guarded status transition, so the service layer never issues raw Mongoose queries. Built on the shared `createBaseRepository` factory and extended with the four operations specific to the payment lifecycle.

## Key elements

- **`paymentRepository`** — exported singleton; a `BaseRepository<PaymentDocument>` (spread from the factory) plus four domain methods.
- **`ownerScope(userId)`** — returns `{ userId: ObjectId }`, a filter fragment callers spread into queries. `undefined` scope means admin/unscoped.
- **`findByIdScoped(paymentId, scope?)`** — single payment by `_id`, ownership enforced *in the query filter* (not post-read).
- **`findByOrderId(orderId, scope?)`** — payment by `orderId`, same scope-in-filter rule.
- **`upsertIntent(orderId, userId, { amount, currency, provider })`** — atomic `findOneAndUpdate … { upsert: true }` that creates or refreshes a payment intent. Only matches when status is `requires_confirmation` or `declined`. Catches MongoDB E11000 (unique-index collision on `orderId`) and returns `null` as the "money already moved" signal.
- **`updateStatusIfIn(orderId, from[], to, extra?)`** — status-machine primitive; the `$in` on the current status in the filter guarantees exactly one of two racing writers matches.

## Relationships

- **`src/infrastructure/persistence/base-repository.ts`** — supplies `createBaseRepository`, `toObjectId`, and the `BaseRepository` type. The base CRUD methods are spread into `paymentRepository`; this file adds the domain-specific methods.
- **`src/modules/payments/model.ts`** — provides `paymentModel` (the Mongoose model) and `applyPaymentTransform` (document-to-DTO mapper passed to the base factory). Also exports the `PaymentDocument` type used throughout.
- **`src/modules/payments/service.ts`** — the primary consumer; orchestrates payment flows by calling `upsertIntent`, `updateStatusIfIn`, and the scoped reads.
- **`src/modules/payments/tests/integration/service.test.ts`** — integration tests that exercise the service and transitively this repository against a real store.
- **`src/types/index.ts`** — source of the `PaymentStatus` union used in `updateStatusIfIn` signatures.

## Notes

- **Explicit type annotation on `paymentRepository`** is intentional: Mongoose generics are too large for TS to serialize an inferred type at an export boundary (TS7056). Same reason the `BaseRepository` generic exists. Do not "simplify" to a bare `satisfies` or inference.
- **Scoping is always in the filter, never post-read.** Spreading `ownerScope(id)` into the query object is the pattern; checking ownership after `findOne` is explicitly called out as an information-leak anti-pattern in the sibling `orders/repository.ts`.
- **E11000 → `null`** in `upsertIntent` is a deliberate control-flow convention, not an error. Callers treat `null` as "intent already in a terminal state"; no exception is thrown for that case.
- **`$in` on status is the concurrency guard** in both `upsertIntent` and `updateStatusIfIn`. Two racing updates produce at most one match because the filter atomically checks the current state.
- **One payment per order** is enforced by a `unique` index on `orderId`, making the upsert a single round-trip with no pre-read.
