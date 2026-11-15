---
source: src/modules/cart/services/merge.ts
sha256: ce6efd6c0fb83d579498bc02b5bed06217ea88a9cf4553759c5a8624ff5fe029
generated_at: 2026-11-14T19:31:55.489751+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/services/merge.ts

## Purpose

Server-side implementation of `POST /cart/merge`: folds a guest (signed-out) cart into the signed-in cart in a single call. It exists here rather than as a browser-side loop of `POST /cart/items` because (1) refused lines must produce a durable notification event, and (2) per-line caps and stock availability must be evaluated against the cart's own state in one place.

## Key elements

- **`MergeResult`** (exported interface) — the response shape: the updated `CartView` plus one `MergeLineResult` per submitted guest line.
- **`mergeLine`** (internal) — processes a single guest line: calls the domain rule (`planMergeLine`), performs a conditional `upsertLine` write if the rule allows an add, then re-reads the resulting quantity from the returned cart document. Detects lost-cap races (`QUANTITY_LIMIT` / `LINE_LIMIT`) and reports them as `capped` / `cart_full`.
- **`mergeLines`** (exported) — iterates all guest lines **sequentially** (each write rewrites the same cart document, so a duplicate product must see the prior line's result). Reads the shelf once for the whole batch. Never throws on a bad line; every line yields a result.
- **`announceRemoved`** (internal) — filters results for `removed` or `cart_full` reasons, fetches product titles via the products service, and emits `CART_MERGE_REFUSED` so the `notifications` module can persist a durable message.
- **`cartMerge`** (exported) — the public entry point: runs `mergeLines`, fires `announceRemoved`, then fetches the badge cart via `cartGetForBadge` and returns `MergeResult`.
- **`writeAdd`** (internal) — wraps the repository's `upsertLine` in `'add'` mode; on a cap sentinel, re-reads the cart so downstream `resulting` stays truthful.
- **`heldIn`** (internal helper) — looks up a product's current quantity in a `CartDocument` (0 if absent).

## Relationships

- **`src/modules/cart/domain/index.ts`** — imports `planMergeLine`, the pure rule that decides how many units to add given requested/held/lineMax/maxLines.
- **`src/modules/cart/repository.ts`** — source of `cartRepository` (for `findByUserId` and `upsertLine`) and the sentinel constants `QUANTITY_LIMIT`, `LINE_LIMIT`, `NO_LINE` used to detect lost races.
- **`src/modules/cart/services/shelf.ts`** — uses `readShelf` (batch product/stock read), `isListed`, and `shelfAvailability` to compute per-line availability.
- **`src/modules/cart/services/items.ts`** — reuses `cartGetForBadge` (final cart view) and `trackLineWrite` (analytics per successful write).
- **`src/modules/cart/events.ts`** — imports the `CART_MERGE_REFUSED` event constant.
- **`src/modules/cart/config.ts`** — reads `cartLineMax()` and `cartMaxLines()` caps.
- **`src/kernel/events.ts`** — calls `emitDomainEvent` to fire `CART_MERGE_REFUSED`.
- **`src/modules/products/index.ts`** — source of `productService`; calls `titlesById` to snapshot product names into the refusal event (product may be delisted before the user reads it).
- **`src/modules/cart/presenter.ts`** — provides the `CartView` type for the returned cart shape.
- **`src/modules/cart/services/reorder.ts`** — reuses the same sequential-loop pattern (noted in this file's docstring) for re-applying lines after a reorder.
- **`src/modules/delivery/tests/unit/fulfillment.test.ts`** — exercises merge-related cart state as part of fulfillment testing.

## Notes

- **Sequential, not parallel, by design.** Lines are processed one at a time because each `upsertLine` rewrites the shared cart document; a product appearing twice must see its first line's result. Do not "optimize" to `Promise.all`.
- **Stock never lowers a quantity.** A line that is short of stock keeps its full quantity and simply carries an `availability` field. This is intentional (see `docs/theory/defences/authorization.md`): lowering would let a caller read exact stock by probing with large quantities.
- **`resulting` is always re-read from the cart document** after the write, not computed from `held + plan.add`. This keeps it truthful even when a concurrent add consumed the cap room.
- **`requested` is always the guest's original number**, regardless of what was actually written. The two fields (`requested` vs. `resulting`) are deliberately independent so the caller can see both the intent and the outcome.
- **`announceRemoved` copies product titles into the event payload.** By the time the user reads the notification the product may be gone; `titlesById` returning an empty map is the intended "no longer available" signal.
