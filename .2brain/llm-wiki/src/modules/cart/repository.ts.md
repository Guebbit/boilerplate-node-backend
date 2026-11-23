---
source: src/modules/cart/repository.ts
source_sha256: a953a0f4c8d7ff603a8a66e06bb7b829eea5bcecda1f9d9b870a321f7a0ba784
context_sha256: 908ffc81e6784dad461c600b5f1ef3f66f8b70e4463fc9edb3b12c53ae1b0a41
generated_at: 2026-11-22T04:34:48.248445+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/cart/repository.ts

## Purpose
Cart repository: the standard CRUD from the repository factory, plus the cart-specific writes. These are upserting a line, replacing all lines under a version guard (merge, reorder), removing a line, clearing all lines (plain, and version-guarded for checkout), and the two cleanup writes owed to product and user deletion. Concurrency conditions are pushed into Mongo filters so they are evaluated atomically by mongod.

## Key elements
- `CartLineMode` — `'set' | 'add' | 'update'`. `'update'` is `'set'` for a line that must already exist and never creates one.
- `LineWrite` — `{ cart, created }`: the cart after the write, and whether the write created the line.
- `QUANTITY_LIMIT`, `LINE_LIMIT`, `NO_LINE` — string sentinels returned instead of a write.
  - `QUANTITY_LIMIT`: an `'add'` would push a line past `cartLineMax()`.
  - `LINE_LIMIT`: a new line would exceed `cartMaxLines()`.
  - `NO_LINE`: `'update'` on a line the cart does not hold.
- `pushNewLine` — `findOneAndUpdate` with `upsert`, `$push` and `$inc: { __v: 1 }`.
  - The filter requires `items.productId` to be absent and `items.<max-1>` not to exist, which enforces the line cap atomically.
  - On a duplicate-key error it reads the cart once. A full cart resolves to `LINE_LIMIT`; any other case rethrows the error.
- `unchangedOrPushed` — the `'set'` miss path. If the line already holds exactly `quantity`, it returns the cart untouched (no version bump). Otherwise it calls `pushNewLine`.
- `unchangedOrMissing` — the `'update'` miss path. It returns the cart untouched if the quantity is identical, `NO_LINE` if the line is absent, or `RETRY` if a concurrent write moved the line.
- `resolveAddMiss` — the `'add'` miss path. One more read settles whether to push a new line, return `QUANTITY_LIMIT`/`LINE_LIMIT`, or `RETRY`.
- `RETRY` — internal symbol meaning "run the whole call again".
- `upsertLine(userId, productId, quantity, mode, attemptsLeft = 3)` — sets or increments one line, creating the cart if needed.
  - The first attempt is an atomic `findOneAndUpdate` on the existing line.
    - `'add'` filters on `$elemMatch` with `quantity <= lineMax - quantity`.
    - `'set'` and `'update'` filter on `quantity !== quantity`.
  - Each write includes `$inc: { __v: 1 }`.
  - On a miss it dispatches to the matching resolver above.
  - It retries up to `attemptsLeft` times, then throws `cart: exhausted retries resolving a contended write`.
- The rest of the repository (replace-lines, remove-line, clear and `clearLinesIfUnchanged`, and the product/user deletion cleanups) is described in the header comment, but its code is not shown here.

## Relationships
- `./config` supplies `cartLineMax()` and `cartMaxLines()`, which are read per call.
- `./model` provides `cartModel`, `applyCartTransform` and the `CartDocument` type.
- `@infrastructure/persistence/create-repository` provides `createRepository`, `toObjectId`, and the `Repository` and `Wire` types.
- `@infrastructure/persistence/mongo-errors` provides `isDuplicateKey`, used to detect unique-`userId`-index collisions.
- The services (`checkout.ts`, `cleanup.ts`, `items.ts`, `merge.ts`) call these writes. The header names checkout (version-guarded clear), merge (replace lines), and cleanup (deletion writes).
- The integration tests (`backorder`, `checkout-interleavings`, `checkout-stock-moved`, `checkout-version`, `line-availability`, `merge-atomic`) exercise these concurrency and version-guard behaviors.

## Notes
- Every line write bumps `__v`. Checkout clears the cart only if the version is unchanged (`clearLinesIfUnchanged`), so a write that skips the `$inc` would be silently dropped by an in-flight checkout.
- An identical `'set'` or `'update'` deliberately does not bump `__v`. Repeating the same PUT mid-checkout therefore does not fail it with `CART_CHANGED`.
- The existing-line filter uses `$elemMatch` rather than two top-level `items.*` conditions. The positional `items.$` is only guaranteed to bind to the element that matched both conditions when they are joined this way.
- The line cap is checked inside the filter, so concurrent adds cannot overshoot it. An existing line is never refused by `LINE_LIMIT`.
- Duplicate-key errors from a contended upsert are retried, not surfaced.
