---
source: src/modules/cart/services/merge.ts
source_sha256: ea9455d538b9f28f8267ffcb95929abce16362a040ac081f7f0cbbcf82217184
context_sha256: 57f9f8792c92d4036c4fefdab2befca0b4e9e5bc72769cf8f146c14b9f8a66aa
generated_at: 2026-11-22T04:36:30.956595+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/cart/services/merge.ts

## Purpose
Folds a guest (signed-out) cart into the signed-in user's cart in one call. It lives server-side so that refused lines can become persistent notifications (via the `cart.merge_refused` event) and so the response can report what each line became and whether it is short on stock, using the stock read and the cart's own caps in one place.

## Key elements
- `cartMerge(userId, lines, context)` — the `POST /cart/merge` entry point. Calls `mergeLines`, announces removed lines, then returns a `MergeResult` (`cart` view plus one `MergeLineResult` per submitted line, in request order).
- `mergeLines(userId, lines, context)` — plans and writes the whole merge in one write. It reads the shelves once for the whole request. Each attempt reads the cart, plans in memory, and commits with `replaceLinesIfUnchanged` against the cart's `__v`. If the cart moved, it re-plans, up to `MERGE_ATTEMPTS` (3) times, then throws. It writes nothing when no line grew. Analytics tracking (`trackLineWrite`) runs only after a successful write. Also reused by `./reorder`.
- `planLines` (private) — pure in-memory planning in request order. Each line sees the result of earlier lines, so a product listed twice accumulates. It delegates each decision to the domain's `planMergeLine`, using the line max, max lines, and whether the product is listed. It returns the full item list, per-line results, and which lines grew.
- `announceRemoved` (private) — for lines with reason `removed` or `cart_full`, it looks up product titles with `productService.titlesOf`. It then emits `CART_MERGE_REFUSED` with `{ userId, lines }`. A failed titles lookup is logged and falls back to `{}` titles. It emits nothing if no line was refused.
- `MergeResult`, `MergeOutcome` (cart, line results, and the `shelves` map, kept so callers don't re-read products), and `NO_SHELF` (the shelf used for an id the catalogue never held).

## Relationships
- `../domain` (`planMergeLine`) — the decision rules for each line.
- `./shelf` — `readShelf`, `isListed`, `shelfAvailability`, and the `Shelf` type; the stock/catalogue reads.
- `./items` — `trackLineWrite` for analytics on written lines.
- `./view` and `../presenter` — `toCartView` builds the returned `CartView`.
- `../repository` — `findByUserId` and `replaceLinesIfUnchanged` (optimistic-concurrency write).
- `../config` — `cartLineMax()` and `cartMaxLines()`.
- `../events` and `@kernel/events` — `CART_MERGE_REFUSED` and `emitDomainEvent`.
- `@infrastructure/adapters/logger` — logs failures of the titles lookup.
- `../model` — `CartDocument` type.
- `./reorder` — reuses `mergeLines`.

## Notes
- Stock never lowers a line's quantity. It only sets `availability`, which avoids leaking exact stock. Checkout remains the real stock gate.
- Only products the catalogue does not show (`removed`) or new lines on a full cart (`cart_full`) are refused. A changed quantity is reported in the response, not as a notification.
- `requested` is always the guest's number and `resulting` is always the plan's number.
- One bad line is a result, never a throw, so it can't stop the rest.
- Retrying the same request can't add a line twice, because the write is version-checked.
- The notification is a courtesy and must never turn an already-written merge into a 500.
