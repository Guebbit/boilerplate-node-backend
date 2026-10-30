---
source: src/modules/cart/services/merge.ts
sha256: fd27679ea5e85966a6946d0a27e40ac1bf2bac772039612cc88ff9e61f50e296
generated_at: 2026-10-29T03:25:02.324924+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/services/merge.ts

## Purpose

Server-side merge of a guest (signed-out) cart into the signed-in user's cart. Lives here rather than in the browser because a delisted line must produce a persistent notification (`cart.merge_refused`), and the per-line answer requires the stock read and the cart cap in one place — neither is achievable via a client-side loop of `POST /cart/items` calls.

## Key elements

- **`cartMerge`** (export) — Entry point for `POST /cart/merge`. Orchestrates: merge lines → announce refused lines → fetch the resulting cart view. Returns `MergeResult`.
- **`MergeResult`** (export) — `{ cart: CartView, lines: MergeLineResult[] }`, the full response shape.
- **`mergeLines`** (export) — Processes every guest line sequentially against one shared cart document. Reads the shelf once for all products. Returns per-line results in request order.
- **`mergeLine`** (internal) — Single-line pipeline: compute held quantity → call `planMergeLine` domain rule → write the allowed delta via `writeAdd` → read back the resulting quantity and availability.
- **`writeAdd`** (internal) — Wraps `cartRepository.upsertLine(…, 'add')`. On `QUANTITY_LIMIT` (concurrent-write race) re-reads the cart and flags `raced: true`.
- **`announceRemoved`** (internal) — Filters results for `reason === 'removed'`, resolves product titles via `productService.titlesById`, then emits `CART_MERGE_REFUSED` with the snapshot.
- **`heldIn`** (internal) — Looks up a product's current quantity in a `CartDocument`; returns `0` if absent.
- **`MergeStep`** (internal) — Pairs a line's `MergeLineResult` with the post-write `CartDocument` so the next line starts from the latest state.

## Relationships

- **`../domain` / `../domain/merge.ts`** — `planMergeLine` is the pure rule that decides how much to add and why (capped, removed, ok). This file never re-implements the math.
- **`../repository.ts`** — `cartRepository.upsertLine` and `findByUserId` are the only writes/reads to the cart document; `QUANTITY_LIMIT` and `NO_LINE` are sentinel return values.
- **`../config.ts`** — `cartLineMax()` supplies the per-line cap fed into the domain rule.
- **`./shelf.ts`** — `readShelf` (batch product/shelf read), `isListed`, `shelfAvailability`, and the `Shelf` type provide catalogue and stock context per line.
- **`./items.ts`** — `cartGetForBadge` fetches the final cart view for the response; `trackLineWrite` records analytics.
- **`../events.ts`** — `CART_MERGE_REFUSED` constant passed to `emitDomainEvent`.
- **`@kernel/events`** — `emitDomainEvent` used to broadcast the refusal notification.
- **`@modules/products`** — `productService.titlesById` resolves product names for the refusal event payload.
- **`./reorder.ts`** — Reuses the same sequential cart-document loop pattern (noted in `mergeLines` JSDoc).
- **`../services/index.ts`** — Barrel that re-exports this module's public API.

## Notes

- **Sequential by design.** Each line reads and rewrites the *same* cart document; a product appearing twice must see the first line's result. Do not parallelise the loop.
- **Stock never lowers a line.** A short line keeps its full quantity; only `availability` in the result changes. Checkout is the sole stock gate (see `docs/theory/defences/authorization.md`, "Reading the shelf").
- **Race at the cap.** If `upsertLine` returns `QUANTITY_LIMIT`, a concurrent add consumed the room after the domain rule ran. The result is reported as `capped` regardless of what `planMergeLine` predicted, and `resulting` is read from the re-fetched document.
- **Bad lines are results, not throws.** A delisted product yields `reason: 'removed'` so it does not strand the remaining lines.
- **Title snapshot.** `announceRemoved` copies product titles into the event payload at merge time because the product may be deleted before the notification is read.
