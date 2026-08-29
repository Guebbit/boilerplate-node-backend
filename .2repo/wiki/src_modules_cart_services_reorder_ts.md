# src/modules/cart/services/reorder.ts

## Purpose

Implements "reorder": copying the line-items of a past order back into the caller's cart. It lives in the cart module (not orders) so that the only write target is the cart, preserving the declared `cart → orders` dependency direction and avoiding a cycle where orders would reach back into cart.

## Key elements

- **`reorderIntoCart(userId, orderId, context)`** — the sole export. Reads the order (scoped to the caller), re-resolves each product against today's catalogue in a single parallel pass, sequentially upserts addable lines into the cart, then returns the refreshed `CartView`. Emits audit + analytics events on success.
- **`ReorderLine`** (local interface) — a resolved order line pairing `productId`, `quantity`, and a nullable `ProductDocument` (`null` = product no longer public).

## Relationships

- **`@infrastructure/http/response`** — shapes the return value via `generateSuccess` / `generateReject` and the `ResponseSuccess<CartView> | ResponseReject` union.
- **`@infrastructure/http/errors`** — `rejectDatabaseEnvelope('cart', error)` maps `CastError` / generic errors to a standard error envelope.
- **`@infrastructure/http/request`** — imports the `CallerContext` type for audit/analytics attribution.
- **`@infrastructure/i18n`** — `t` translates user-facing messages (order-not-found, unavailable, success).
- **`@infrastructure/observability/analytics`** — `emitAnalyticsEvent` + `buildAnalyticsBase` fire the `CART_REORDERED` event on success.
- **`@infrastructure/observability/audit`** — `emitAuditEvent` + `buildAuditEvent` record the `USER_CART_REORDERED` action.
- **`../analytics` / `../audit`** — supply the `cartAnalyticsEvents` and `cartAuditActions` constants used above.
- **`../repository`** — `cartRepository.upsertLine` (sequential writes) and `cartRepository.findByUserId` (final cart read).
- **`./view`** — `toCartView` serialises the raw cart document into the API-facing `CartView`.
- **`@modules/orders`** — `orderRepository.findByIdScoped(orderId, orderRepository.visibleScope(userId))` fetches only the caller's own order.
- **`@modules/products`** — `productRepository.findPublicById` re-validates each product; `ProductDocument` is the resolved type.
- **`services/index.ts`** — barrel that re-exports this service.

## Notes

- **Sequential cart writes are intentional.** Parallel `upsertLine` calls against the same cart document race on the unique `userId` index; the `for…await` loop guarantees each write sees the previous one's state.
- **Two-shapes product ID.** The order's embedded snapshot may carry the id as `id` (normalized aggregate output) or `_id` (raw Mongoose). The code reads both spellings (`snapshot.id ?? snapshot._id`) rather than casting, to stay correct regardless of which shape the repository returns.
- **Skip vs. refuse semantics.** `upsertCartItem` in `./items` *refuses* a non-public product (correct for a single "add to cart" call). Here, skipping is the right behaviour for a batch refill; however, if *every* line is skipped the response is a 409 `REORDER_UNAVAILABLE`, not a 200 with an unchanged cart.
- **Scoping is caller-only.** `visibleScope(userId)` means an admin cannot reorder another user's order into their own cart — the cart being written is always the caller's.
