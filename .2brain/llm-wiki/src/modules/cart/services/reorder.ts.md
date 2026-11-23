---
source: src/modules/cart/services/reorder.ts
source_sha256: d631d0ff2d8bb77df8d210e3b07246c5c1cc4aa086fd1ecccb4bd2569bb952a0
context_sha256: 8915c91984b229b00892fac01c4ce7025b8e7241641a550665d3285a541942ec
generated_at: 2026-11-22T04:36:52.185923+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/cart/services/reorder.ts

## Purpose
Implements "reorder": copying the lines of a past order back into the caller's cart. It lives in the cart module (not orders) because the cart is what gets written while the order is only read, which keeps the declared `cart → orders` dependency direction and avoids an orders → cart cycle.

## Key elements
- `reorderIntoCart(authContext, orderId, context)` — the sole export. Returns `Promise<ResponseSuccess<MergeResult> | ResponseReject>`.
  - Fetches the order via `orderService.getById(orderId, orderService.ownLiveScope(userId))`. A missing order gives a 404 (`cart.reorder.order-not-found`).
  - Maps the order's items to `{ productId, quantity }` and passes them to `mergeLines`.
  - If no line landed (every line is `removed` or `cart_full`):
    - If any line was `cart_full`, it returns `lineLimitReached()`.
    - Otherwise it returns a 409 with `ERROR_CODES.REORDER_UNAVAILABLE`.
  - On success it returns 200 with `{ cart, lines }`, where `cart` is built by `toCartView`.
  - Any thrown error goes through `rejectDatabaseEnvelope('cart', error)`.
  - On a successful result only, it calls `recordAudit` (`USER_CART_REORDERED`, with `order_id` in metadata) and `emitAnalyticsEvent` (`CART_REORDERED`).

## Relationships
- `@modules/orders` (`orderService`): reads the order. `getById` and `ownLiveScope` are the only calls used.
- `./merge`: `mergeLines` applies the per-line rules, so reorder and merge cannot disagree. `MergeResult` is the response payload type.
- `./items`: `lineLimitReached()` supplies the cart-full rejection.
- `./view`: `toCartView` shapes the written cart for the response.
- `../audit` and `../analytics`: provide `cartAuditActions` and `cartAnalyticsEvents`. They are recorded through `infrastructure/observability/audit` and `.../analytics`.
- `infrastructure/http/response` and `infrastructure/http/errors`: build the success and reject envelopes and map database errors.
- `infrastructure/i18n`: `t()` supplies the translated messages.
- `@api/error-codes`: supplies `REORDER_UNAVAILABLE`.

## Notes
- Scoping uses `ownLiveScope`, not `callerScope`. `callerScope` is role-based, so an admin could read any order. Reorder must only read the caller's own orders, and `ownLiveScope` also excludes soft-deleted ones (`deletedAt: null`).
- Per-line outcomes (`removed`, `capped`, `cart_full`) are reported in `lines` and are not failures, unlike `upsertCartItem` in `./items`. Only an order with nothing addable at all returns 409. A partly addable order returns 200.
- Audit and analytics are emitted only when the result is a success, and they run after the error mapping. Rejections are not recorded here.
