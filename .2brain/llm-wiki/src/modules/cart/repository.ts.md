---
source: src/modules/cart/repository.ts
sha256: 41963330f0428bc4b5578ef9239a806c83d5a082e94710e577f47cc4ef3ae7fb
generated_at: 2026-09-27T14:45:26.489041+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/repository.ts

## Purpose

Cart repository that extends the shared `createRepository` factory with the six cart-specific write operations (upsert line, remove line, clear all, version-guarded clear, set shipping method, and the two cleanup deletes). All writes are keyed by `userId` alone, since the schema's unique index makes that a complete document address. Every mutating write bumps `__v` so the checkout version guard (`clearLinesIfUnchanged`) sees each change.

## Key elements

- **`cartRepository`** — the exported repository object. Spreads `createRepository(cartModel, { transform: applyCartTransform })` for standard CRUD, then adds the cart-specific methods. Explicitly typed (not inferred) because Mongoose's generics are too large for TS inference at this boundary (TS7056).
- **`CartLineMode`** (`'set' | 'add'`) — controls whether `upsertLine` overwrites or increments a line's quantity.
- **`QUANTITY_LIMIT`** — sentinel string returned by `upsertLine` in `'add'` mode when the increment would exceed `CART_LINE_MAX`.
- **`upsertLine(userId, productId, quantity, mode)`** — sets or increments one line; creates the cart if absent. Uses an atomic `findOneAndUpdate` with conditions in the filter (not a preceding read) to prevent duplicate-line races. Retries on duplicate-key errors (up to 3 attempts). In `'add'` mode, a second filter check (`quantity <= CART_LINE_MAX - quantity`) makes the cap enforcement atomic.
- **`pushNewLine`** (internal) — `$push`es a new line with `upsert: true`, creating the cart document if needed.
- **`removeLine(userId, productId)`** — `$pull`s one line; resolves `null` if cart or line is absent (lets callers return 404 without a separate read).
- **`clearLines(userId)`** — empties `items`; does **not** upsert (a missing cart is already empty).
- **`clearLinesIfUnchanged(userId, version)`** — empties `items` **only if** `__v` still matches the caller's read. The losing half of the checkout race; uses `timestamps: false` so an untouched cart isn't stamped as "recently edited."
- **`setShippingMethod(userId, shippingMethodId)`** — sets or clears (`$unset`) the shipping method; uses `upsert: true` since it may be set before any lines exist.
- **`deleteByUserId(userId, session?)`** — hard-deletes the cart document; accepts an optional `ClientSession` for transactional cleanup.
- **`removeProductFromAll(productId)`** — removes a product's lines from every cart (product-deletion cleanup).

## Relationships

- **`src/infrastructure/persistence/create-repository.ts`** — provides `createRepository`, `toObjectId`, `Repository`, and `Wire`. `cartRepository` spreads the factory's CRUD and calls `toObjectId` in every filter.
- **`src/infrastructure/persistence/mongo-errors.ts`** — `isDuplicateKey` is the guard in `upsertLine`'s `.catch` to decide whether to retry a contended upsert.
- **`src/modules/cart/model.ts`** — source of `cartModel`, `applyCartTransform`, `CART_LINE_MAX`, and the `CartDocument` type used throughout.
- **`src/modules/cart/services/checkout.ts`** — calls `clearLinesIfUnchanged` as the conditional-write step that resolves the parallel-checkout race (only one checkout wins the version guard).
- **`src/modules/cart/services/items.ts`** — primary consumer of `upsertLine`, `removeLine`, and `clearLines` for the cart item endpoints.
- **`src/modules/cart/services/reorder.ts`** — calls repository write methods when re-adding a previously purchased set of items.
- **`src/modules/cart/services/cleanup.ts`** — calls `deleteByUserId` (user deletion) and `removeProductFromAll` (product deletion).
- **Test files** (`checkout-version.test.ts`, `schema-contract.test.ts`, `service.test.ts`, `stock.test.ts`, `order-snapshot-locale.test.ts`, `product-removal-protects-orders.test.ts`) — integration suites exercising the version guard, cap enforcement, schema shape, and cleanup paths.

## Notes

- **`$elemMatch` is mandatory in `'add'` mode.** Two separate `'items.x'` filter conditions can each match a *different* array element; only `$elemMatch` guarantees `items.$` binds to the single element that matched both conditions. Using the flat form silently writes the quantity to the wrong product.
- **`__v` bump is non-negotiable on every write.** The checkout version guard reads `__v` once and later empties conditionally on it. Any write that skips `$inc: { __v: 1 }` is invisible to that guard and would let a concurrent mutation be silently dropped.
- **`upsertLine` retry cap is 3.** `attemptsLeft` only bounds a pathological loop; the duplicate-key path converges on the next pass by design (MongoDB's contended-upsert guidance).
- **`clearLinesIfUnchanged` uses `timestamps: false`** while `clearLines` does not: the former is checkout's side effect, not a shopper action, and should not bump `updatedAt`.
- **`findByUserId` returning `null` ≡ empty cart.** No code path creates a placeholder cart document; callers must treat `null` and `{ items: [] }` as equivalent.
- **Explicit generic on the `.then` callback** in `upsertLine` is load-bearing: without it, TS infers the callback's return from the outer function signature and drops the `QUANTITY_LIMIT` branch.
