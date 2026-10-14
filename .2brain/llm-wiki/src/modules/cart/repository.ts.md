---
source: src/modules/cart/repository.ts
sha256: 7dc23649a1b2aab70e0f016de8aae9eaee7ba68ad5d0c325761f239eddd28e44
generated_at: 2026-10-14T15:10:02.631248+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/repository.ts

## Purpose

Cart persistence layer. Wraps `cartModel` with the six writes a cart actually takes (upsert/remove/clear a line, version-guarded clear, shipping-method set, product/user deletion) on top of the shared CRUD factory. All line-level writes handle concurrency inline—conditions live in the MongoDB filter, not in a preceding read—so two simultaneous requests cannot both conclude "absent" and both append.

## Key elements

- **`CartLineMode`** — `'set' | 'add'`; controls whether `upsertLine` replaces or increments a line's quantity.
- **`LineWrite`** — `{ cart, created }`; the result shape returned by line writes (`created: true` means a new line was inserted).
- **`QUANTITY_LIMIT`** — sentinel string (`'quantity-limit'`) returned (not thrown) when an `'add'` would push a line past `cartLineMax()`.
- **`upsertLine`** (internal, exposed via the repository) — set or increment one line; retries on duplicate-key up to 3 times; in `'add'` mode enforces the quantity ceiling atomically inside the filter.
- **`pushNewLine`** (internal) — `$push`es a new line, upserts the cart document, bumps `__v`.
- **`unchangedOrPushed`** (internal) — `'set'` no-op path: if the line already holds the exact quantity, returns it untouched; otherwise delegates to `pushNewLine`.
- **`cartRepository`** (exported) — the public object:
  - `findByUserId` — read; `null` means the user has no cart (no placeholder docs are ever created).
  - `upsertLine` / `removeLine` / `clearLines` — the three basic line writes.
  - `clearLinesIfUnchanged(userId, version, session?)` — conditional empty used by checkout as the race guard (only one of two parallel checkouts wins).
  - `setShippingMethod` — replaces or clears the shipping method.
  - `deleteByUserId` / `removeProductFromAll` — cleanup writes owed to user/product deletion.
  - Standard CRUD methods from `createRepository`.

## Relationships

- **`src/modules/cart/model.ts`** — provides `cartModel`, `applyCartTransform`, and the `CartDocument` type used throughout.
- **`src/modules/cart/config.ts`** — provides `cartLineMax()`, the per-line quantity ceiling read once per `upsertLine` call.
- **`src/infrastructure/persistence/create-repository.ts`** — provides `createRepository` (standard CRUD), `toObjectId`, and the `Repository`/`Wire` types that shape the export.
- **`src/infrastructure/persistence/mongo-errors.ts`** — provides `isDuplicateKey`, used to detect and retry contended upserts.
- **`src/modules/cart/services/checkout.ts`** — consumes `clearLinesIfUnchanged` as the conditional-write half of checkout.
- **`src/modules/cart/services/items.ts`** — consumes `upsertLine`, `removeLine`, `clearLines`, `findByUserId`.
- **`src/modules/cart/services/cleanup.ts`** — consumes `deleteByUserId`, `removeProductFromAll`.
- **`src/modules/cart/services/merge.ts` / `reorder.ts`** — consume `findByUserId` and the standard CRUD writes.
- **Integration tests** (`checkout-version`, `line-availability`, `merge`, `merge-effects`, `preorder`) — exercise the repository's concurrency and quantity-limit paths end-to-end.

## Notes

- **`__v` is the concurrency currency.** Every mutating write bumps `__v`. Skipping the bump (e.g., a line added mid-checkout) makes the write invisible to `clearLinesIfUnchanged`'s guard, silently dropping the line instead of failing the checkout.
- **`$elemMatch` is load-bearing.** Two separate top-level `items.x` conditions can each match *different* array elements, causing the positional `$` operator to update the wrong line. The code uses `$elemMatch` to guarantee a single-element match.
- **`'set'` mode matches only lines whose quantity *differs*.** An identical PUT must not bump `__v`, or repeating it mid-checkout would fail with `CART_CHANGED` (violates idempotency per RFC 9110 §9.2.2).
- **`QUANTITY_LIMIT` is a resolved value, not a rejection.** Callers must check the sentinel rather than catching an error.
- **`attemptsLeft` defaults to 3** and bounds both the duplicate-key retry and the contended `'add'` re-read loop. Exhausting it throws a plain `Error`.
- **`clearLines` deliberately does not upsert.** A user with no cart already satisfies "empty"; `null` is the correct answer, and no placeholder document is created.
- **Explicit type annotation on `cartRepository`** is required (TS7056) because Mongoose's generics are too large for the compiler to infer at the export boundary.
- **No upsert on `findByUserId`**: `null` is a meaningful state equivalent to an empty cart.
