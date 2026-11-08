---
source: src/modules/cart/repository.ts
sha256: 33fcbdd6942141a599e8de82e423245d4b08e966b1a842c810da9f15b617f09e
generated_at: 2026-11-08T05:16:00.547274+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/repository.ts

## Purpose

Cart repository that provides standard CRUD (via the shared repository factory) plus the six domain-specific writes a cart actually takes: upsert a line, remove a line, clear all lines (plain and version-guarded), set shipping method, and the two cleanup writes for product/user deletion. All writes are keyed by `userId` alone, since the schema's `unique: true` index makes that a complete address.

## Key elements

- **`CartLineMode`** (`'set' | 'add' | 'update'`) — controls how `upsertLine` treats an existing line's quantity.
- **`LineWrite`** — `{ cart, created }` result shape returned by line writes.
- **`QUANTITY_LIMIT`** / **`NO_LINE`** — sentinel strings returned when `'add'` hits the per-line ceiling or `'update'` finds no matching line.
- **`upsertLine(userId, productId, quantity, mode, attemptsLeft?)`** — the core write. Builds a filter that embeds the quantity condition so mongod evaluates it under the document lock. On a filter miss, dispatches to a mode-specific resolver (`unchangedOrPushed`, `unchangedOrMissing`, `resolveAddMiss`) that either writes, returns a sentinel, or signals `RETRY` to re-run the whole call. Catches duplicate-key errors and retries up to 3 times.
- **`pushNewLine`** — `findOneAndUpdate` with `$push` + `$inc: { __v: 1 }` + `upsert: true`; used when no existing line matches.
- **`unchangedOrPushed`** / **`unchangedOrMissing`** / **`resolveAddMiss`** — miss-handlers for `'set'`, `'update'`, and `'add'` respectively; each settles the ambiguity of a concurrent write with one extra read.
- **`cartRepository`** — the exported object. Spreads `createRepository(cartModel, { transform: applyCartTransform })` for standard CRUD, then adds `findByUserId`, `upsertLine`, `removeLine`, `clearLines`, `clearLinesIfUnchanged` (version-guarded, accepts a `ClientSession`), `setShippingMethod`, `deleteByUserId`, and `removeProductFromAll`.

## Relationships

- **`./model`** — imports `cartModel` (Mongoose model), `applyCartTransform` (document→wire mapper), and the `CartDocument` type. All reads/writes go through `cartModel`.
- **`./config`** — imports `cartLineMax()` for the per-line quantity ceiling used in the `'add'` filter and new-line guard.
- **`@infrastructure/persistence/create-repository`** — provides `createRepository` (CRUD factory), `toObjectId`, and the `Repository` / `Wire` type helpers.
- **`@infrastructure/persistence/mongo-errors`** — imports `isDuplicateKey` to identify contended-upsert rejections for the retry loop.
- **Services** (`checkout`, `cleanup`, `items`, `merge`) — consume `cartRepository` for their respective reads and writes; `clearLinesIfUnchanged` is the version-guarded clear that `checkout` calls conditionally on its earlier read.
- **Integration tests** (`backorder`, `checkout-interleavings`, `checkout-stock-divergence`, `checkout-version`, `line-availability`, `merge-effects`) — exercise the concurrency paths (duplicate-key retry, `__v` bump, version guard) through this repository.

## Notes

- **`$elemMatch` is mandatory for the positional operator.** Two separate top-level `'items.x'` conditions can each match *different* array elements, causing `items.$` to update the wrong line. The code comments link the MongoDB docs page explaining this.
- **`__v` is bumped in the same atomic update as the quantity write**, not in a separate `$inc`. Skipping it would make a concurrent write invisible to `clearLinesIfUnchanged`'s version guard, silently dropping a line mid-checkout.
- **`'set'` with an identical quantity is a deliberate no-op** (no `__v` bump) so that repeating a PUT leaves state unchanged (RFC 9110 §9.2.2).
- **`lineMax` is read once per `upsertLine` call** so the filter and the retry-resolver agree on the same ceiling within a single logical write.
- **`RETRY` is a module-private `Symbol`**; it is never returned to callers. The retry is internal and bounded by `attemptsLeft` (default 3).
- **The export's type is written out explicitly** rather than inferred — Mongoose's generics are too large for TS to resolve at the export boundary (TS7056).
- **`findByUserId` returning `null`** means the user has never added anything; this is treated as equivalent to an empty cart (no placeholder document is created).
