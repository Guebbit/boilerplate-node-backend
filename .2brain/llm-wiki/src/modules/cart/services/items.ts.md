---
source: src/modules/cart/services/items.ts
sha256: 7c9cdf996fcc76e442b694ceed227cca88d277b5f4a558a64a31723868cce880
generated_at: 2026-09-23T18:32:43.839885+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/services/items.ts

## Purpose

Cart item read/write service. Provides the operations to read a user's cart lines, add or set quantities, remove a single line, or clear the entire cart. Every single-product mutation runs a catalogue gate (`productService.findPublicById`) and returns a `ResponseSuccess | ResponseReject` envelope; `cartRemove` is the exception — it is idempotent and returns a bare `CartView` because an already-empty cart is a valid success state.

## Key elements

- **`cartGet`** — Reads cart lines joined with product data. No analytics, no envelope.
- **`cartGetForBadge`** — Alias for `cartViewOf`. Returns a `CartView` (count + totals) without emitting `CART_VIEWED`. Intended for the header badge poll.
- **`cartGetForView`** — Same read as badge but emits `CART_VIEWED` analytics. The "person opening their basket" path.
- **`upsertCartItem`** *(private)* — Shared write path for add/set. Validates the product exists and is public via `productService.findPublicById`, then delegates to `cartRepository.upsertLine`. Returns 404 for unknown products, 422 (`CART_QUANTITY_LIMIT`) when the `add` mode exceeds `QUANTITY_LIMIT`.
- **`cartItemSetById`** — Calls `upsertCartItem` in `'set'` mode. No analytics; the caller decides what to emit.
- **`cartItemAdd`** — Wraps `cartItemSetById` and emits `CART_ITEM_ADDED` on success. Requires `CallerContext`.
- **`cartItemUpdateQuantity`** — Wraps `cartItemSetById` and emits `CART_ITEM_UPDATED` on success. Requires `CallerContext`.
- **`cartItemAddById`** — Calls `upsertCartItem` in `'add'` mode. The only mode that can trip `QUANTITY_LIMIT`.
- **`cartItemRemoveById`** — Removes one line. Returns 404 if the line (or cart) is absent. Emits `CART_ITEM_REMOVED` analytics and records an audit entry.
- **`cartRemove`** — Clears all lines. Idempotent: a user with no cart document still gets an empty `CartView`. Emits `CART_CLEARED`.

## Relationships

- **`./view.ts`** — Source of `CartLine`, `CartView` types and the `readCartLines` / `toCartView` mappers used to shape repository output.
- **`../repository.ts`** — All persistence: `findByUserId`, `upsertLine`, `removeLine`, `clearLines`, and the `QUANTITY_LIMIT` constant.
- **`../analytics.ts`** — Event name constants (`cartAnalyticsEvents.*`) referenced in every analytics emission.
- **`../audit.ts`** — `cartAuditActions` constants for the audit log (currently only `USER_CART_ITEM_REMOVED` is used here).
- **`@modules/products` (`productService`)** — `findPublicById` is the catalogue gate that rejects non-public or missing products before any write.
- **`@infrastructure/http/response`** — `generateSuccess` / `generateReject` build the envelope returned by single-product operations.
- **`@infrastructure/observability/analytics`** — `emitAnalyticsEvent` and `buildAnalyticsBase` for analytics.
- **`@infrastructure/observability/audit`** — `recordAudit` for the audit trail on removal.
- **`@infrastructure/i18n`** — `t()` for user-facing error messages (`products.not-found`, `cart.quantity-limit`).
- **`@types` (`CallerContext`)** — Required by the analytics/audit-bearing exports; absent from `cartGet`, `cartItemSetById`, `cartItemAddById`.
- **`../module.ts`** — Module registration (imported by the barrel, not directly by this file's logic).
- **`../services/index.ts`** — Re-exports the public functions from this file.
- **`tests/integration/service.test.ts`** — Integration tests exercise these service functions end-to-end.

## Notes

- **Stock is intentionally NOT checked here.** Availability is gated by the product's public status; unit-level stock is held only at checkout.
- **`'set'` mode never hits `QUANTITY_LIMIT`** on its own (the request is pre-bounded to the max); only `'add'` mode (used by wishlist move-to-cart) can exceed it.
- **Analytics/audit are opt-in per export.** `cartItemSetById` emits nothing; the `Add`/`UpdateQuantity` wrappers add the emit. This keeps internal callers (tests, reorder) free of a `CallerContext` requirement.
- **`cartItemRemoveById` returns 404, not a silent 200.** A client that cannot see the line it tried to delete is told its view is stale.
- **`cartRemove` has no response envelope.** Clearing an already-empty cart is the desired state, so the function returns a plain `CartView` rather than risking a spurious error code.
