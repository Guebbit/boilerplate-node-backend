---
source: src/modules/cart/repository.ts
sha256: 33fcbdd6942141a599e8de82e423245d4b08e966b1a842c810da9f15b617f09e
generated_at: 2026-10-29T03:23:31.841464+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/repository.ts

## Purpose

The cart repository: standard CRUD (via the shared repository factory) plus the six domain-specific writes a cart actually takes — upsert a line (set/add/update), remove a line, clear all lines (plain and version-guarded), and the two cleanup writes owed to product/user deletion. All cart writes are keyed by `userId` alone, since the schema's `unique: true` index makes that a complete document address.

## Key elements

- **`cartRepository`** (exported) — the sole public export. Spreads `createRepository(cartModel, { transform: applyCartTransform })` and adds:
  - `findByUserId` — fetches the user's cart; `null` means the cart does not yet exist (no placeholder docs are created).
  - `upsertLine(userId, productId, quantity, mode)` — sets, adds, or conditionally updates one line; returns `LineWrite`, `QUANTITY_LIMIT`, or `NO_LINE`.
  - `removeLine(userId, productId)` — removes a single line.
  - `clearLines(userId)` — empties all lines unconditionally.
  - `clearLinesIfUnchanged(userId, version, session?)` — empties lines only if `__v` still equals `version`; the atomic guard for checkout.
  - `setShippingMethod(userId, shippingMethodId | null)` — sets or clears the shipping method.
  - `deleteByUserId(userId, session?)` — full document removal (user-delete cleanup).
  - `removeProductFromAll(productId)` — strips a product line from every cart (product-delete cleanup); returns affected user IDs.
- **`CartLineMode`** — `'set' | 'add' | 'update'`; controls how an existing line's quantity is treated.
- **`LineWrite`** — `{ cart: CartDocument; created: boolean }`; the successful result of `upsertLine`.
- **`QUANTITY_LIMIT`** / **`NO_LINE`** / **`RETRY`** — sentinel values (not thrown errors) that short-circuit `upsertLine`'s return type when the write cannot or should not proceed.
- **Internal helpers** (`pushNewLine`, `unchangedOrPushed`, `unchangedOrMissing`, `resolveAddMiss`) — resolve the "filter missed" path for each mode, distinguishing *genuinely absent*, *already at target*, and *concurrently mutated* (→ retry).

## Relationships

- **`./model.ts`** — imports `cartModel` (Mongoose model), `applyCartTransform` (document → wire transform), and the `CartDocument` type.
- **`./config.ts`** — imports `cartLineMax()` to enforce the per-line quantity ceiling.
- **`@infrastructure/persistence/create-repository.ts`** — imports `createRepository`, `toObjectId`, and the `Repository`/`Wire` type contracts; provides the base CRUD surface that `cartRepository` spreads.
- **`@infrastructure/persistence/mongo-errors.ts`** — imports `isDuplicateKey` to detect the contended-upsert case and trigger a bounded retry.
- **`./services/checkout.ts`** — calls `clearLinesIfUnchanged` to atomically empty the cart after stock deduction; a `null` return signals a concurrent cart mutation that aborts checkout.
- **`./services/items.ts`** — primary caller of `upsertLine` (add/set) and `removeLine`.
- **`./services/merge.ts`** — calls `upsertLine` to fold source-cart lines into the destination cart.
- **`./services/cleanup.ts`** — calls `deleteByUserId` and `removeProductFromAll` during user/product deletion.
- **Test files** (`tests/integration/*.test.ts`) — exercise `upsertLine` concurrency, `clearLinesIfUnchanged` version guarding, merge effects, and backorder/stock-divergence scenarios against the repository.

## Notes

- **`$elemMatch` is mandatory, not stylistic.** Two separate top-level `items.x` conditions can each match *different* array elements, causing the positional `$` operator to update the wrong line. The code comments cite the MongoDB docs on this.
- **`__v` bump is load-bearing.** Every line write includes `$inc: { __v: 1 }` in the *same* atomic operation. Skipping it makes the write invisible to `clearLinesIfUnchanged`, which would silently drop a line added mid-checkout instead of invalidating the race.
- **`'set'` mode matches only a *different* quantity** (`quantity: { $ne: quantity }`). An identical set is a no-op that must not bump `__v`, per idempotent-PUT semantics (RFC 9110 §9.2.2).
- **Duplicate-key retry is bounded to 3 attempts** (`attemptsLeft`). The retry mirrors MongoDB's guidance for contended upserts; exhaustion throws rather than surfacing the raw Mongo error.
- **`lineMax` is read once per `upsertLine` call** so the atomic filter and the post-miss check agree on the same ceiling.
- The explicit generic on the `.then<…>()` callback is required: without it, TypeScript infers from the outer function's declared return and silently drops the `QUANTITY_LIMIT` branch (TS narrowing issue).
- The file was truncated in the source provided; `removeLine`, `clearLines`, `clearLinesIfUnchanged`, `setShippingMethod`, `deleteByUserId`, and `removeProductFromAll` are declared in the type annotation but their bodies follow the same `cartModel.findOneAndUpdate` / `deleteMany` pattern.
