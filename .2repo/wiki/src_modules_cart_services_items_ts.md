# src/modules/cart/services/items.ts

## Purpose

Service layer for reading a user's cart and mutating its contents (add, set, remove). Every mutating operation follows the same shape: one write to the repository, then the join that prices the result into a `CartView`. It also houses the shared "catalogue gate" that ensures a cart line can only reference a product the storefront actually serves.

## Key elements

- **`cartGet(userId)`** — Read cart lines joined with their products. No analytics.
- **`cartViewOf(userId)`** *(internal)* — Read cart and compute the summary view (item count, total quantity, total price).
- **`cartGetForBadge`** — Alias for `cartViewOf`; header-badge polling. Deliberately emits no `cart_viewed` event.
- **`cartGetForView(userId, context)`** — Same read as badge, but emits the `cart_viewed` analytics event.
- **`upsertCartItem`** *(internal)* — Shared write path for "set" and "add" modes. Calls `productRepository.findPublicById` as the catalogue gate (404 if product is not public), then delegates to `cartRepository.upsertLine`.
- **`cartItemSetById(userId, id, quantity?)`** — Set a line's quantity. Returns a response envelope; no analytics.
- **`cartItemAdd(userId, id, quantity, context)`** — `POST /cart` wrapper around `cartItemSetById`; emits `cart_item_added` on success.
- **`cartItemUpdateQuantity(userId, id, quantity, context)`** — `PUT /cart/{productId}` wrapper; emits `cart_item_updated` on success.
- **`cartItemAddById(userId, id, quantity?)`** — Increment an existing line's quantity (`'add'` mode). No analytics.
- **`cartItemRemoveById(userId, id, context)`** — Remove one line. Returns 404 if the cart or line does not exist. Emits both an audit event and an analytics event.
- **`cartRemove(userId, context)`** — Clear all lines. Idempotent (no cart → already empty). Returns `CartView` directly with **no** response envelope, since it cannot fail.

## Relationships

- **`src/modules/cart/services/view.ts`** — Provides `readCartLines`, `toCartView`, and the `CartLine`/`CartView` types that every read and write in this file resolves to.
- **`src/modules/cart/repository.ts`** — `cartRepository` supplies `findByUserId`, `upsertLine`, `removeLine`, and `clearLines`; this file is its sole business-logic caller.
- **`src/modules/products/index.ts`** — Exports `productRepository`; this file calls `findPublicById` as the catalogue gate before any write.
- **`src/infrastructure/http/response.ts`** — `generateSuccess` / `generateReject` and the `ResponseSuccess` / `ResponseReject` envelope types used by every product-naming operation.
- **`src/infrastructure/http/request.ts`** — `CallerContext` type passed to analytics/audit emitters.
- **`src/infrastructure/observability/analytics/index.ts`** — `emitAnalyticsEvent` and `buildAnalyticsBase` for route-specific events.
- **`src/infrastructure/observability/audit.ts`** — `emitAuditEvent` and `buildAuditEvent` (used only by `cartItemRemoveById`).
- **`src/modules/cart/analytics.ts`** — `cartAnalyticsEvents` enum for event-name constants.
- **`src/modules/cart/audit.ts`** — `cartAuditActions` enum for audit-action constants.
- **`src/infrastructure/i18n/index.ts`** — `t()` used for the 404 "not found" message.
- **`src/modules/cart/tests/integration/service.test.ts`** — Integration tests exercise the exported functions in this file.

## Notes

- **Catalogue gate lives in the service, not the route.** `findPublicById` is the single predicate for "is this product on the storefront shelf." The `./reorder` caller applies the same rule but with a *skip* (not *refuse*) semantics, so it resolves products itself and writes survivors directly through the repository.
- **Stock is intentionally absent from the gate.** A sold-out product may still be held in a cart; stock is checked at checkout (`./checkout`) when units are actually reserved.
- **Envelope vs. no envelope.** The three operations that name a product (`cartItemSetById`, `cartItemAddById`, `cartItemRemoveById`) return a `ResponseSuccess | ResponseReject` because they can 404. `cartRemove` and `cartGet`/`cartGetFor*` return bare `CartView`/`CartLine[]` because they cannot fail.
- **Analytics are applied at the route-level wrappers, not in the shared write.** `cartItemAdd` and `cartItemUpdateQuantity` wrap the identical `cartItemSetById` call so that unit tests and other internal callers remain free of a `CallerContext` they do not need.
- The file's doc block explicitly references `docs/theory/layers.md` for the rationale behind placing cross-caller invariants in the service layer.
