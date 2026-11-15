---
source: src/modules/cart/repository.ts
sha256: 7f85e6e82b89e9e1ebb15f3da298d2e8359bea849ef495d133409c77b0f1003d
generated_at: 2026-11-14T19:29:36.966217+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/repository.ts

## Purpose

Provides the cart's data-access layer: a standard CRUD repository (via `createRepository`) plus the six domain-specific writes a cart actually performs — upsert/remove/clear lines and the two cleanup writes triggered by product or user deletion. All line mutations enforce per-line and per-cart quantity ceilings atomically inside the MongoDB filter, and bump `__v` so checkout's version-guarded clear can detect in-flight modifications.

## Key elements

- **`CartLineMode`** (`'set' | 'add' | 'update'`) — controls how `upsertLine` treats a quantity: `'set'` replaces (never creates), `'add'` increments, `'update'` replaces only if the line already exists.
- **`LineWrite`** — `{ cart, created }` shape returned on successful line writes.
- **`QUANTITY_LIMIT` / `LINE_LIMIT` / `NO_LINE`** — sentinel strings (not exceptions) resolved when a write is refused by a ceiling or the line is absent.
- **`upsertLine(userId, productId, quantity, mode, attemptsLeft?)`** — the primary line writer. Encodes concurrency guards in the filter (`$elemMatch` with quantity conditions), retries on duplicate-key collisions (up to 3 attempts), and dispatches to miss-resolvers per mode.
- **`pushNewLine`** — atomic `$push` + `$inc __v` with a line-count filter; resolves `LINE_LIMIT` on duplicate-key + full-cart read-back.
- **`unchangedOrPushed` / `unchangedOrMissing` / `resolveAddMiss`** — miss-path resolvers that disambiguate "no line yet" from "concurrent write moved it" and either push, return a sentinel, or signal `RETRY`.
- **`RETRY`** — internal `Symbol` that tells `upsertLine` to re-execute the entire call with one fewer attempt.

## Relationships

- **`./model`** — imports `cartModel` (the Mongoose model), `applyCartTransform`, and the `CartDocument` type; all reads/writes go through this model.
- **`./config`** — reads `cartLineMax()` and `cartMaxLines()` at call time to build the filter conditions.
- **`@infrastructure/persistence/create-repository`** — imports `createRepository` (factory for the standard CRUD half), `toObjectId` (string→ObjectId coercion), and the `Repository` / `Wire` types.
- **`@infrastructure/persistence/mongo-errors`** — uses `isDuplicateKey` to detect and retry contended upserts rather than surfacing them.
- **`./services/items`** — primary caller of `upsertLine` for add/set/update line operations.
- **`./services/checkout`** — calls the version-guarded clear (`clearLinesIfUnchanged`) and reads `__v` to detect mid-checkout mutations.
- **`./services/cleanup`** — issues the product-deletion and user-deletion writes.
- **`./services/merge`** — calls the clear-all-then-repush sequence.
- **Tests** (`tests/integration/*`) — exercise the retry, ceiling, and interleaving paths end-to-end against MongoDB.

## Notes

- **Sentinels over exceptions.** `QUANTITY_LIMIT`, `LINE_LIMIT`, `NO_LINE`, and the internal `RETRY` symbol are resolved values, not thrown errors. Callers must narrow the union return type.
- **`$elemMatch` is load-bearing.** Two separate top-level `items.x` conditions are *not* equivalent; MongoDB only guarantees positional `$` binding when both conditions are joined under one `$elemMatch`. The code uses `$elemMatch` deliberately to avoid updating the wrong array element.
- **`__v` is bumped with the write, not separately.** A line added while checkout is in flight must be visible to checkout's version-guarded clear; a separate `$inc` could be lost to the ordering window.
- **Duplicate-key retry is bounded** by `attemptsLeft` (default 3). Exhaustion throws a plain `Error`; this path is expected to be rare.
- **`lineMax` is read once per call.** Both the filter condition and the miss-resolution must agree on the same ceiling; re-reading `cartLineMax()` mid-retry is intentionally avoided.
- The file is the import target for all cart services; there is no other data-access path for cart documents.
