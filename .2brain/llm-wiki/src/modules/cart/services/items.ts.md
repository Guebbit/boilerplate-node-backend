---
source: src/modules/cart/services/items.ts
sha256: db730532fa59ebc933cc6eaf9b33c3b2bb90b093d8fc09ed1da6f12763c8bf85
generated_at: 2026-09-27T14:46:37.279142+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/services/items.ts

## Purpose

Service layer for reading and mutating cart contents: fetching lines, adding/setting/removing items, clearing the cart, and selecting a shipping method. Each mutating operation is a single write plus a priced join; operations that name a specific product return a response envelope because the product may not exist, while `cartRemove` cannot fail and returns the view directly.

## Key elements

- **`cartGet`** – Returns `CartLine[]` (lines joined with product data) for a user.
- **`cartGetForBadge` / `cartGetForView`** – Identical read (`cartViewOf`); the former is a passive badge poll (no analytics), the latter emits `CART_VIEWED`.
- **`upsertCartItem`** (internal) – Shared add/set logic. Gates on `productService.findPublicById` (catalogue visibility, not stock). Returns 404 for unknown product, 422 for `QUANTITY_LIMIT` (only reachable in `'add'` mode).
- **`cartItemSetById`** – Set quantity by product ID; no analytics (envelope is message-less by design).
- **`cartItemAdd`** – `POST /cart`; wraps `cartItemSetById`, emits `CART_ITEM_ADDED`.
- **`cartItemUpdateQuantity`** – `PUT /cart/{productId}`; wraps `cartItemSetById`, emits `CART_ITEM_UPDATED`.
- **`cartItemAddById`** – Add to existing quantity (only caller that can hit `QUANTITY_LIMIT`).
- **`cartItemRemoveById`** – Remove one line; 404 if cart or line missing (single query covers both). Records audit + emits `CART_ITEM_REMOVED`.
- **`cartRemove`** – Clear all lines; idempotent (no cart doc → empty view). Emits `CART_CLEARED`.
- **`cartShippingMethodSet`** – Set or clear (`null`) shipping method. Validates method existence (404), applicability (`needsShipping`), and weight range (`methodFitsWeight`) against current basket (409). Validation is a UX courtesy; checkout re-validates independently.

## Relationships

- **`services/view.ts`** – Provides `readCartLines`, `toCartView`, `isJoined`, and the `CartLine`/`CartView` types used throughout.
- **`repository.ts`** – All persistence: `findByUserId`, `upsertLine`, `removeLine`, `clearLines`, `setShippingMethod`; also exports `QUANTITY_LIMIT`.
- **`domain/index.ts`** – `basketWeight` and `needsShipping` for shipping-method validation.
- **`analytics.ts`** – `cartAnalyticsEvents` enum consumed by every analytics emission.
- **`audit.ts`** – `cartAuditActions` for the `cartItemRemoveById` audit record.
- **`@infrastructure/http/response`** – `generateSuccess` / `generateReject` / envelope types for all product-named operations.
- **`@infrastructure/i18n`** – `t()` for user-facing error messages.
- **`@infrastructure/observability/analytics`** – `emitAnalyticsEvent` / `buildAnalyticsBase` for event emission.
- **`@infrastructure/observability/audit`** – `recordAudit` for the remove-by-id audit trail.
- **`@modules/products`** – `productService.findPublicById` as the catalogue visibility gate.
- **`@modules/delivery`** – `findShippingMethod`, `methodFitsWeight` for shipping validation.
- **`module.ts` / `services/index.ts`** – Barrel re-exports.
- **`tests/integration/service.test.ts`** – Exercises these functions end-to-end.

## Notes

- **Stock is deliberately not checked here.** It is enforced only at checkout, where units are actually held.
- **`cartRemove` is the only export without a response envelope.** Clearing an already-empty cart is a valid success state, so there is no failure path to encode.
- **`'set'` mode can never hit `QUANTITY_LIMIT`** (the request itself is bounded to `CART_LINE_MAX`); only `'add'` mode (wishlist move-to-cart) can exceed it.
- **404 on `cartItemRemoveById` is intentional.** A client deleting a line it cannot see must learn its view is stale rather than receiving a silent no-op.
- **Shipping-method validation is not the enforcement point.** `services/checkout.ts`'s `resolveShipping` re-validates from scratch at the point of payment; this function exists so a caller gets early feedback.
- **`null` as a shipping-method ID means "clear the choice"** (module convention D17c) and always succeeds.
