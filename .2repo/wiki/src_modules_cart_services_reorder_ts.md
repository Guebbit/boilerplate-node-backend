# src/modules/cart/services/reorder.ts

## Purpose

Copies a past order's line items back into the caller's cart. It lives in the **cart** module (not orders) because the write target is the cart; the order is only read. This keeps the `cart → orders` dependency direction that the module manifests declare and avoids the cycle an `/orders/{id}/reorder` route would require.

## Key elements

- **`reorderIntoCart(userId, orderId, context)`** — The sole export. Resolves the order (scoped to the caller), re-resolves each product against today's catalogue via `productRepository.findPublicById`, sequentially upserts addable lines into the cart, and returns a `CartView`. Emits audit + analytics events on success.
- **`ReorderLine`** (local interface) — A single requested line with its resolved `product` (`ProductDocument | null`). `null` means the product is gone/inactive/soft-deleted and the line will be skipped.

## Relationships

- **`@modules/orders` / `orderRepository`** — Reads the order via `findByIdScoped` with `visibleScope(userId)`; the only cross-module data read.
- **`@modules/products` / `productRepository`** — Resolves each `productId` through `findPublicById` to check current availability.
- **`../repository` (`cartRepository`)** — Writes lines with `upsertLine` and reads the final cart with `findByUserId`.
- **`./view` (`toCartView`, `CartView`)** — Shapes the final cart document into the API response.
- **`@infrastructure/i18n` (`t`)** — Localised error/success messages.
- **`@infrastructure/http/response`** — `generateSuccess` / `generateReject` envelope construction.
- **`@infrastructure/http/errors`** — `rejectDatabaseEnvelope` for the `.catch` handler.
- **`@infrastructure/observability/analytics`** — Emits a `CART_REORDERED` analytics event on success.
- **`@infrastructure/observability/audit`** — Emits a `USER_CART_REORDERED` audit event on success.
- **`../analytics` / `../audit`** — Provide the event-name and action constants used above.

## Notes

- **Sequential writes are intentional.** Each `upsertLine` reads-then-rewrites the same cart document; parallel calls would lose lines to a last-write-wins race. The `for…await` loop is not an oversight.
- **Skip, don't refuse.** An unavailable product is silently dropped from the batch. Only when *every* line is unavailable does the call return `409 REORDER_UNAVAILABLE`. This contrasts with `./items`' `upsertCartItem`, which rejects the whole request on a single bad product.
- **`id` vs `_id` duality.** Scoped aggregate reads return normalized output where `_id` is already renamed to `id`, but the static type still shows `_id`. The code reads both (`snapshot.id ?? snapshot._id`) rather than casting — a deliberate guard against the two-shapes trap that also affects `orderService.getById`.
- **Scoping is a security boundary.** `visibleScope(userId)` ensures a caller can only reorder their *own* orders; it is not merely a convenience filter.
