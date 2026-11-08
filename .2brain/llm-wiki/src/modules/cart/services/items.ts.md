---
source: src/modules/cart/services/items.ts
sha256: 9de8d686b8ae2561759b6107ee2acd3ca6123b6173fc40ad97473b92c1361944
generated_at: 2026-11-08T05:17:17.677586+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/services/items.ts

## Purpose

Service layer for reading a cart and mutating its line items (add, set, update, remove, clear) plus setting the cart's shipping method. Every write returns a response envelope (`ResponseSuccess | ResponseReject`) so callers can distinguish a created line (201) from a changed one (200) and surface structured errors (404, 409, 422). The file also splits the "view cart" read into two variants so analytics can attribute `CART_VIEWED` only to a human opening the basket, not a badge poll.

## Key elements

- **`cartGet`** – Returns `CartLine[]` joined with product data for a user.
- **`cartGetForBadge` / `cartGetForView`** – Two named exports over the same `cartViewOf` read. The badge variant is analytics-free; the view variant emits `CART_VIEWED`.
- **`upsertCartItem`** (private) – Core write path. Validates product existence, applies the per-line quantity ceiling (`cartLineMax()`), delegates to `cartRepository.upsertLine`, and maps sentinel results (`QUANTITY_LIMIT`, `NO_LINE`) to 422/404 envelopes.
- **`cartItemSetById` / `cartItemAddById`** – Public wrappers calling `upsertCartItem` in `'set'` or `'add'` mode; no `CallerContext` required.
- **`cartItemAdd` / `cartItemUpdateQuantity`** – Same operations plus analytics via `emitItemWritten` (emits `CART_ITEM_ADDED` or `CART_ITEM_UPDATED`).
- **`trackLineWrite`** – Standalone analytics helper: picks the event name based on the `created` flag.
- **`cartItemRemoveById`** – Removes one line; 404 if cart or line is absent. Emits audit record (`USER_CART_ITEM_REMOVED`) and `CART_ITEM_REMOVED` analytics.
- **`cartRemove`** – Clears all lines. Idempotent (no cart → empty view, no error). Emits `CART_CLEARED`.
- **`cartShippingMethodSet`** – Validates a method against the current basket (unknown → 404, digital-only or out-of-weight → 409) before persisting; `null` clears the choice unconditionally.
- **`quantityLimit`** (private) – Builds the shared 422 `CART_QUANTITY_LIMIT` reject envelope.

## Relationships

- **`../repository` (`cartRepository`)** – All persistence (`findByUserId`, `upsertLine`, `removeLine`, `clearLines`, `setShippingMethod`). Sentinels `QUANTITY_LIMIT` and `NO_LINE` are returned by the repository and mapped here to HTTP errors.
- **`../domain` (`basketWeight`, `needsShipping`)** – Used by `cartShippingMethodSet` to reject mismatched method/basket combinations.
- **`../config` (`cartLineMax`)** – Supplies the shop-level per-line ceiling enforced in the `'set'` path.
- **`../analytics` / `../audit`** – Provide the typed event/action constants consumed by the analytics and audit emissions.
- **`@infrastructure/http/response`** – `generateSuccess` / `generateReject` build every envelope this file returns.
- **`@infrastructure/i18n`** – `t()` supplies user-facing error messages.
- **`@infrastructure/observability/analytics` / `audit`** – `emitAnalyticsEvent`, `buildAnalyticsBase`, `recordAudit` are the observation primitives.
- **`./view` (`readCartLines`, `toCartView`, `isJoined`)** – Transform repository rows into the joined line list and the `CartView` summary.
- **`../presenter` (`CartView`)** – Type for the computed cart summary returned to callers.
- **`./errors` (`shippingMethodNotFound`)** – Pre-built 404 reject for an unknown shipping method.
- **`@modules/products` (`productService.findPublicById`)** – Catalogue gate: confirms the product exists and is public before any write.
- **`@modules/delivery` (`findShippingMethod`, `methodFitsWeight`)** – Resolves and weight-validates the shipping method.
- **`./merge`** – Sibling service; the module docstring notes reorder goes through merge's own rule rather than `upsertCartItem`.

## Notes

- The response envelope's status (201 vs 200) is the **service-level** signal for created-vs-updated; HTTP routes always answer 200 because the line is written through its parent cart.
- `cartItemAdd` wraps `cartItemAddById` rather than inlining the analytics emit, so callers without a `CallerContext` (tests, wishlist move-to-cart) can use the bare variant.
- Stock availability is deliberately **not** checked here; it is validated only at checkout.
- The per-line ceiling is enforced in two places: `cartLineMax()` in the `'set'` path (before the write) and the repository in the `'add'` path (after the write). Both produce the same 422 code.
- `cartRemove` has no envelope because it cannot fail—clearing an empty cart is the requested end state.
