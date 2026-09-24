---
source: src/modules/cart/repository.ts
sha256: 021bf21cf7808f300b29a8f978fd2ae50c60a6538e3b77c866c1964fee3d7593
generated_at: 2026-09-23T18:31:43.654172+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/repository.ts

## Purpose

The cart domain's repository layer. It wraps the standard CRUD provided by the shared repository factory with the six write operations a cart actually needs (line upsert/remove, full clear, version-guarded clear, and two cleanup writes), each keyed by `userId` since a unique index makes that a complete address.

## Key elements

- **`CartLineMode`** (`'set' | 'add'`) — union type controlling how `upsertLine` treats quantity: overwrite or increment.
- **`QUANTITY_LIMIT`** — sentinel string returned (not thrown) when an `'add'` would exceed `CART_LINE_MAX`; callers check for this value.
- **`cartRepository`** — the single exported object. Spreads `createRepository(cartModel, { transform: applyCartTransform })` for standard CRUD, then adds:
  - `findByUserId` — fetch a cart; `null` means the user has never added anything.
  - `upsertLine(userId, productId, quantity, mode)` — atomic set-or-increment of one line, creating the cart/line as needed. Handles concurrent-writer races via filter-embedded conditions, duplicate-key retry (max 3 attempts), and the `QUANTITY_LIMIT` sentinel.
  - `removeLine(userId, productId)` — `$pull` one line; `null` if cart or line absent (lets the service return 404 without a prior read).
  - `clearLines(userId)` — `$set: { items: [] }`; deliberately does **not** upsert.
  - `clearLinesIfUnchanged(userId, version)` — checkout's conditional clear: matches on `__v`, clears items, and bumps `__v`. Returns `null` when the cart moved (race lost). Uses `timestamps: false`.
  - `deleteByUserId(userId)` — hard-delete the cart document (account-deletion cleanup).
  - `removeProductFromAll(productId)` — `$pull` a product from every cart (product-deletion cleanup).

## Relationships

- **`create-repository.ts`** — provides the `createRepository` factory, `toObjectId` helper, and the `Repository` / `Wire` types that shape the export signature.
- **`mongo-errors.ts`** — `isDuplicateKey` is checked in `upsertLine`'s catch to decide whether to retry a contended upsert.
- **`model.ts`** — supplies `cartModel` (the Mongoose model), `applyCartTransform` (field serialization), `CART_LINE_MAX` (quantity ceiling), and the `CartDocument` type.
- **`services/checkout.ts`** — consumes `clearLinesIfUnchanged`; the version guard exists specifically so that exactly one concurrent checkout wins the right to empty the cart.
- **`services/cleanup.ts`** — calls `deleteByUserId` (account deletion) and `removeProductFromAll` (product deletion) to keep carts consistent with the parent entities.
- **`services/items.ts`** — calls `upsertLine`, `removeLine`, and `findByUserId` for the day-to-day add/remove/list endpoints.
- **`services/reorder.ts`** — interacts with `clearLines` as part of reordering the cart contents.
- **Integration tests** (`schema-contract.test.ts`, `service.test.ts`, `stock.test.ts`) — exercise the repository's public surface and the concurrency/quantity-limit paths.

## Notes

- **Concurrency model:** Every write condition lives *inside* the `findOneAndUpdate` filter, so mongod evaluates it under the document lock. A preceding `findOne` would create a TOCTOU window. This is intentional and load-bearing for `upsertLine`.
- **`$elemMatch` for the positional operator:** The `'add'` match uses `items.$elemMatch` (not two top-level `items.x` conditions) because MongoDB's `$` positional binding only guarantees correct-element matching when conditions are joined with `$elemMatch`. Two separate conditions can each match *different* array elements, silently updating the wrong line.
- **Explicit generic on `.then()`:** In `upsertLine`, the `.then<CartDocument | typeof QUANTITY_LIMIT>(…)` annotation is required; without it TS infers the callback's return from the outer function's declared type and drops the sentinel branch.
- **`clearLinesIfUnchanged` versioning:** Uses a manual `__v` check + `$inc` rather than Mongoose's built-in optimistic concurrency (which only guards `save()`, not `findOneAndUpdate`). A `MongoMemoryReplSet`-based transaction was considered but rejected to avoid forcing replica-set fixtures on every cart test.
- **`null` return convention:** `null` from a read/write method means "the document or line does not exist," not an error. Services translate this to 404 or no-op.
- **`timestamps: false` on `clearLinesIfUnchanged`:** The checkout-triggered clear should not bump `updatedAt`, because it is a system side-effect, not a user edit.
