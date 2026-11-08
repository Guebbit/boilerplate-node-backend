---
source: src/modules/cart/services/merge.ts
sha256: fd27679ea5e85966a6946d0a27e40ac1bf2bac772039612cc88ff9e61f50e296
generated_at: 2026-11-08T05:17:37.058445+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/services/merge.ts

## Purpose

Folds a guest cart (built while signed out) into the signed-in user's cart in a single server-side call. It lives here rather than in the browser because refused lines must become persistent notifications (via a domain event) and the per-line cap + stock read must be applied atomically per line — something a client-side loop of `POST /cart/items` cannot do.

## Key elements

- **`cartMerge`** (exported) — Entry point for `POST /cart/merge`. Orchestrates `mergeLines` → `announceRemoved` → `cartGetForBadge`, returning a `MergeResult`.
- **`MergeResult`** (exported) — Response shape: `{ cart: CartView, lines: MergeLineResult[] }`.
- **`mergeLines`** (exported) — Iterates guest lines **sequentially** in request order, threading the updated `CartDocument` into each step. Reads all product shelves once up front.
- **`mergeLine`** (internal) — Processes one line: calls `planMergeLine` for the decision, writes via `writeAdd` if `plan.add > 0`, then reads back `resulting` from the post-write cart. On a lost cap race, forces `reason: 'capped'`.
- **`writeAdd`** (internal) — Calls `cartRepository.upsertLine(userId, productId, qty, 'add')`. Treats `QUANTITY_LIMIT` as a concurrent-write race and re-reads the cart. Emits `trackLineWrite` for analytics on success.
- **`heldIn`** (internal) — Reads the current quantity of a product from a `CartDocument` (zero if absent).
- **`MergeStep`** (internal) — Per-line intermediate: `{ result: MergeLineResult, cart: CartDocument | null }`.
- **`announceRemoved`** (internal) — Filters results for `reason === 'removed'`, fetches product names via `productService.titlesById` (names are snapshotted because the product may be deleted before the notification is read), and emits `CART_MERGE_REFUSED`. No-op if no lines were removed.

## Relationships

- **`src/kernel/events.ts`** — Imports `emitDomainEvent` to fire `CART_MERGE_REFUSED`.
- **`src/modules/cart/config.ts`** — Imports `cartLineMax()` for the per-line quantity cap.
- **`src/modules/cart/domain/index.ts`** (→ `domain/merge.ts`) — Imports `planMergeLine`, the pure decision function that maps `{requested, held, listed, lineMax}` to `{add, reason}`.
- **`src/modules/cart/events.ts`** — Imports the `CART_MERGE_REFUSED` event constant.
- **`src/modules/cart/model.ts`** — Imports the `CartDocument` type (the persisted cart shape).
- **`src/modules/cart/presenter.ts`** — Imports the `CartView` type used in the response.
- **`src/modules/cart/repository.ts`** — Imports `cartRepository` (for `upsertLine`, `findByUserId`), `QUANTITY_LIMIT`, and `NO_LINE` sentinels.
- **`src/modules/cart/services/items.ts`** — Imports `cartGetForBadge` (final cart read) and `trackLineWrite` (analytics).
- **`src/modules/cart/services/shelf.ts`** — Imports `readShelf`, `isListed`, `shelfAvailability`, and the `Shelf` type for catalogue/stock lookups.
- **`src/modules/cart/services/reorder.ts`** — Reuses the same sequential-loop pattern (documented in a comment here).
- **`src/modules/products/index.ts`** — Imports `productService` to resolve `titlesById` for removed-line notifications.
- **`src/modules/delivery/tests/unit/fulfillment.test.ts`** — Exercises merge behavior indirectly through delivery fulfillment scenarios.

## Notes

- **Sequential, not parallel.** Each `mergeLine` reads and rewrites the same `CartDocument`; the loop threads `step.cart` into the next iteration. A product listed twice in the guest cart must see its first line's result.
- **Stock never reduces quantity.** A short line keeps its requested quantity and merely carries an `availability` annotation. Lowering quantity would leak exact stock to a caller (see `docs/theory/defences/authorization.md`).
- **`QUANTITY_LIMIT` on add = race, not cap.** The conditional write in the repository is the cap's real guard; hitting `QUANTITY_LIMIT` during an *add* means a concurrent write consumed the room. The code re-reads the cart and forces `reason: 'capped'`.
- **`NO_LINE` is checked defensively.** It is an `'update'`-mode sentinel that an add should never encounter, but the type system does not exclude it.
- **`requested` vs `resulting`.** `requested` is always the guest's submitted number; `resulting` is always what the cart actually holds after the write (or after the race re-read). They are independent of whatever `reason` string is attached.
- **Removed-line names are snapshotted at event time.** `productService.titlesById` is called before the event is emitted because the product may be deleted before a notification reader looks it up. An empty title map is the reader's signal that the product no longer exists.
