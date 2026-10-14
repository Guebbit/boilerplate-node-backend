---
source: src/modules/cart/services/merge.ts
sha256: a6513d9b4d67df300a71ff9a1e0cacf44434bfc9979dbaaa9591b7fd7df20de8
generated_at: 2026-10-14T15:12:15.901255+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/services/merge.ts

## Purpose

Implements the guest-cart merge (`POST /cart/merge`): folds every line from an unsigned-out cart into the signed-in user's cart in a single server-side call. It exists server-side because refused lines must produce a persistent notification (via `cart.merge_refused`) and the per-line cap must be enforced against the same cart document that is being written—neither is possible with a browser loop of individual `POST /cart` calls.

## Key elements

- **`cartMerge`** (exported) — entry point; orchestrates `mergeLines` → `announceRemoved` → `cartGetForBadge`, returning a `MergeResult`.
- **`MergeResult`** (exported) — response shape: the final `CartView` plus one `MergeLineResult` per submitted line, in request order.
- **`mergeLine`** — processes a single guest line: calls `planMergeLine` (domain rule), writes the allowed quantity via `writeAdd`, reads back the actual held quantity, and stamps `availability` from the shelf.
- **`mergeLines`** — loops lines sequentially (each rewrites the same cart doc), batching a single `readShelf` call for all products up front.
- **`writeAdd`** — repository upsert; on `QUANTITY_LIMIT` (concurrent-write race) re-reads the cart and flags `raced`, which forces the reason to `capped`.
- **`announceRemoved`** — for lines whose reason is `removed`, fetches product titles via `productService.titlesById` and emits `CART_MERGE_REFUSED` so the notification survives even if the product is later deleted.
- **`trackAdd`** — fires `CART_ITEM_ADDED` or `CART_ITEM_UPDATED` analytics per line based on the repository's `created` flag.
- **`heldIn` / `isListed`** — small helpers: look up a product's current quantity in a cart doc; check whether the shelf lists the product publicly.

## Relationships

- **`src/modules/cart/domain/merge.ts`** — provides `planMergeLine`, the pure rule that decides how many units to add and why (via `src/modules/cart/domain/index.ts` re-export).
- **`src/modules/cart/repository.ts`** — `cartRepository.upsertLine` / `findByUserId` perform the actual read/write; `QUANTITY_LIMIT` sentinel signals a cap race.
- **`src/modules/cart/config.ts`** — `cartLineMax()` supplies the per-line quantity ceiling to the domain rule.
- **`src/modules/cart/services/shelf.ts`** — `readShelf` (bulk product/stock fetch) and `shelfAvailability` (availability label) are the stock-read layer.
- **`src/modules/cart/services/items.ts`** — `cartGetForBadge` produces the final `CartView` returned to the caller.
- **`src/modules/cart/events.ts`** — `CART_MERGE_REFUSED` event name, emitted through `src/kernel/events.ts` (`emitDomainEvent`).
- **`src/modules/cart/analytics.ts`** + **`src/infrastructure/observability/analytics/index.ts`** — event-name constants and the `emitAnalyticsEvent` / `buildAnalyticsBase` helpers.
- **`src/modules/cart/services/index.ts`** — barrel re-export so routes import `cartMerge` without the full path.
- **`src/modules/cart/tests/integration/merge-effects.test.ts`** — integration tests covering merge outcomes (capping, removal, ordering).
- **`src/modules/cart/tests/integration/line-availability.test.ts`** — tests that `availability` reflects stock without reducing quantity.

## Notes

- **Sequential, not parallel.** Lines are processed one at a time because each upsert rewrites the same cart document; a duplicate product must see its first line's result before the second plans.
- **Stock never mutates quantity.** A short line keeps its requested quantity and reports `availability` from the ledger. Deliberately prevents callers from probing exact stock levels by merging large quantities (see `docs/theory/defences/authorization.md`).
- **`requested` vs `resulting`.** `requested` is always the guest's original number; `resulting` is always what the cart actually holds after the write. They can diverge on cap or race—both remain truthful.
- **Race at the cap.** If a concurrent `POST /cart` consumed the last room between the domain rule's check and the repository write, the line is reported as `capped` (not the rule's original reason) because the quantity was not actually grown.
- **Titles copied at merge time.** `announceRemoved` snapshots product names into the event payload so the notification stays meaningful even if the product record is deleted before the user reads it.
