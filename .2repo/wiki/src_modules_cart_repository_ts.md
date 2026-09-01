# src/modules/cart/repository.ts

## Purpose

Cart repository that extends the shared repository factory with the six domain-specific writes a cart requires: line upsert, line removal, cart clearing (plain and version-guarded), and the two cleanup writes owed to product/user deletion. All writes are keyed by `userId` alone, since the schema's `unique: true` constraint makes that a complete document address.

## Key elements

- **`CartLineMode`** — exported type `'set' | 'add'`; controls whether `upsertLine` overwrites or increments the quantity.
- **`upsertLine`** (module-private) — two-phase `findOneAndUpdate`: tries to update an existing line in-place (`$set` or `$inc`), falls back to `$push` with `upsert: true` if the line is absent. Catches duplicate-key errors and retries up to 3 times (concurrency-safe per MongoDB's upsert guidance).
- **`cartRepository`** — the single export. Spreads `createRepository(cartModel, { transform: applyCartTransform })` and adds:
  - `findByUserId` — returns the cart or `null` (no placeholder documents are ever created).
  - `upsertLine` — public wrapper around the internal function.
  - `removeLine` — `$pull` the line; resolves `null` if the cart or line doesn't exist (lets the service return 404 without a pre-read).
  - `clearLines` — `$set: { items: [] }`; deliberately does **not** upsert (no cart = already empty).
  - `clearLinesIfUnchanged(userId, version)` — conditional write guarded on `__v === version`; increments `__v` after clearing. This is the optimistic-concurrency gate that makes checkout idempotent (exactly one of two parallel checkouts wins).
  - `deleteByUserId` — hard-deletes the cart (account-deletion cleanup).
  - `removeProductFromAll` — `updateMany` + `$pull` to remove a product from every cart (product-deletion cleanup).

## Relationships

- **`./model.ts`** — provides `cartModel`, `applyCartTransform`, and the `CartDocument` type.
- **`@infrastructure/persistence/create-repository`** — supplies the `createRepository` factory, `toObjectId` helper, and the `Repository<T>` base type that `cartRepository` extends.
- **`@infrastructure/http/errors`** — `isDuplicateKey` is used by `upsertLine`'s retry logic to distinguish retriable concurrency collisions from real failures.
- **`../services/checkout.ts`** — calls `clearLinesIfUnchanged` as the race-resolution step before confirming an order.
- **`../services/cleanup.ts`** — calls `deleteByUserId` and `removeProductFromAll` when a user or product is permanently removed.
- **`../services/items.ts`** — calls `findByUserId`, `upsertLine`, `removeLine`, and `clearLines` for day-to-day cart mutation.
- **`../services/reorder.ts`** — calls `upsertLine` to re-add a previous order's lines.
- **Tests** (`schema-contract.test.ts`, `service.test.ts`, `stock.test.ts`) — exercise the repository's read/write contracts and concurrency guarantees.

## Notes

- **Concurrency in `upsertLine`**: the match condition lives *inside* the filter (not a preceding read), so mongod evaluates it under the document lock. A losing concurrent request hits the unique `userId` index instead; the duplicate-key catch retries the whole upsert (max 3 attempts). Do not refactor to read-then-write.
- **`clearLinesIfUnchanged` and Mongoose optimistic locking**: Mongoose's built-in `__v` check only applies to `Document.save()`, not `findOneAndUpdate`. This method implements the guard manually. `timestamps: false` is passed so the write doesn't bump `updatedAt` and invalidate an in-flight read.
- **Explicit type annotation on `cartRepository`**: required because Mongoose's generics are too large for TypeScript to infer at the export boundary (TS7056). Remove only if the generic situation changes.
- **No empty-cart placeholders**: a `null` return from `findByUserId`/`removeLine`/`clearLines` is semantically identical to "empty cart." Service code must treat `null` as a valid, non-error state.
