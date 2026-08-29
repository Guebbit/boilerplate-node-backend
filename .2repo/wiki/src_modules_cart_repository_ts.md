# src/modules/cart/repository.ts

## Purpose

Data-access layer for the cart aggregate. Exposes a single `cartRepository` object that combines standard CRUD (via a shared base factory) with the four cart-specific write operations. Every method is addressed by `userId` (unique on the schema) rather than a cart id, so callers never need to fetch before mutating.

## Key elements

- **`CartLineMode`** (`'set' | 'add'`) — union type controlling whether `upsertLine` replaces or increments a line's quantity.
- **`upsertLine`** (module-private const, re-exported on `cartRepository`) — sets or increments one cart line, creating the cart if none exists. Uses two sequential `findOneAndUpdate` calls with conditions *in the filter* (not a preceding read) so concurrent requests converge. Retries up to 3 times on duplicate-key errors.
- **`cartRepository`** (main export) — typed object with:
  - Base CRUD spread from `createBaseRepository<CartDocument>`.
  - `findByUserId` — returns the cart or `null` (no placeholder documents are created).
  - `upsertLine` — see above.
  - `removeLine` — `$pull` a single line; resolves `null` if cart or line absent.
  - `clearLines` — sets `items: []`; does **not** upsert.
  - `clearLinesIfUnchanged` — conditionally empties the cart only if `__v` matches the caller's read version; also increments `__v` to invalidate stale references.
  - `deleteByUserId` — hard-deletes the cart document.
  - `removeProductFromAll` — `updateMany` / `$pull` to strip a product from every cart.

## Relationships

- **`src/modules/cart/model.ts`** — imports `cartModel`, `applyCartTransform`, and the `CartDocument` type; the repository is the sole consumer of the Mongoose model at the data-access tier.
- **`src/infrastructure/persistence/base-repository.ts`** — imports `createBaseRepository`, `toObjectId`, and the `BaseRepository` interface; provides the standard CRUD half of the export and the ObjectId conversion helper.
- **`src/infrastructure/http/errors.ts`** — imports `isDuplicateKey` to detect contended-upsert race losses in `upsertLine`'s retry loop.
- **`src/modules/cart/services/items.ts`** — primary caller of `upsertLine`, `removeLine`, `clearLines`, and `findByUserId`.
- **`src/modules/cart/services/checkout.ts`** — caller of `clearLinesIfUnchanged`; the conditional write is the race guard that ensures at most one checkout wins.
- **`src/modules/cart/services/cleanup.ts`** — caller of `clearLines` / `deleteByUserId`.
- **`src/modules/cart/index.ts`** — re-exports `cartRepository` (and `CartLineMode`) for consumers outside the module.
- **`src/modules/cart/tests/integration/service.test.ts`** — exercises the repository through service-level integration tests.
- **`src/modules/products/tests/integration/service.test.ts`** — exercises `removeProductFromAll` in the context of product deletion.

## Notes

- **No read-before-write.** Every mutation uses `findOneAndUpdate` with the condition in the filter. This is deliberate: a preceding `find` would open a race window between check and write.
- **`clearLinesIfUnchanged` does not use Mongoose's built-in optimistic concurrency** (`save()`-based `__v` guard). It implements its own `__v` check in the filter and increments it in the update, because all writes here go through `findOneAndUpdate`, which bypasses Mongoose's `save()` path.
- **`clearLines` intentionally does not upsert.** A user with no cart is already in the "empty" state; creating a placeholder document would change the meaning of `null` from `findByUserId`.
- **Type is written out explicitly** on `cartRepository` rather than inferred, because Mongoose's generic chain is too large for TypeScript to serialize across an export boundary (TS7056).
- **`upsertLine` retry budget is 3 attempts.** A duplicate key at `attemptsLeft === 1` is rethrown; this is a safety valve against pathological loops, not an expected path.
- **`timestamps: false`** on `clearLinesIfUnchanged` — the write mutates `__v` manually and does not want Mongoose to also bump `updatedAt`.
