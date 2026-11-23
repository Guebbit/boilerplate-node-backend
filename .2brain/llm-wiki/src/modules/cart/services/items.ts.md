---
source: src/modules/cart/services/items.ts
generated_at: 2026-11-22T04:36:21.562518+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/cart/services/items.ts

## Purpose
Reading a user's cart and changing its contents: fetching the cart, adding, setting, updating and removing lines, clearing the cart, and choosing a shipping method ahead of checkout. Each operation is one write plus the join that prices the response. The operations that name a product return a `ResponseSuccess<CartView> | ResponseReject` envelope, since the product may not exist or may not be in the cart. `cartRemove` names no product and cannot fail, so it returns a bare `CartView`.

## Key elements
- `cartGet(userId)` – returns the cart's lines, each joined with its product (`CartLine[]`).
- `cartGetForBadge` – `GET /cart/summary`. Returns the cart view and emits no analytics.
- `cartGetForView(userId, context)` – `GET /cart`. Returns the same view and emits `CART_VIEWED`.
- `lineLimitReached()` – the 409 `CART_LINE_LIMIT_REACHED` rejection. Exported for `./reorder`.
- `upsertCartItem` (private) – shared core for the `'set'`, `'add'` and `'update'` modes. It does the following:
  - Gates on the product catalogue lookup (`findPublicById`), answering 404 if the product is not found.
  - Enforces the per-line ceiling `cartLineMax()` for non-`'add'` modes, answering 422 `CART_QUANTITY_LIMIT`.
  - Delegates to `cartRepository.upsertLine` and maps the `QUANTITY_LIMIT`, `LINE_LIMIT` and `NO_LINE` sentinels to 422, 409 and 404.
  - Answers 201 if the write created the line and 200 otherwise.
- `cartItemSetById` / `cartItemAddById` – thin wrappers over `upsertCartItem` in `'set'` and `'add'` modes, with no analytics and a default quantity of 1.
- `cartItemAdd` – `POST /cart/items`. Wraps `cartItemAddById` and emits the analytics event.
- `cartItemUpdateQuantity` – `PATCH /cart/items/{productId}`. Runs `'update'` mode, which never creates a line, and emits the analytics event.
- `trackLineWrite(context, productId, quantity, created)` – exported. Emits `CART_ITEM_ADDED` if the line was created and `CART_ITEM_UPDATED` otherwise. Shared with the guest-cart merge.
- `emitItemWritten` (private) – calls `trackLineWrite` only on success, treating status 201 as "created". It returns the result unchanged.
- `cartItemRemoveById(userId, id, context)` – removes a line. It answers 404 if the repository returns no cart. On success it records the `USER_CART_ITEM_REMOVED` audit entry and emits `CART_ITEM_REMOVED`.
- `cartRemove(userId, context)` – clears all lines, emits `CART_CLEARED` and returns the view. It is idempotent.
- `cartShippingMethodSet(userId, shippingMethodId | null)` – `PUT /cart/shipping-method`. `null` clears the choice and always succeeds. Otherwise the method is validated against the current basket (see Notes). The visible content stops partway through this function.

## Relationships
- **`../repository`** – the persistence layer: `findByUserId`, `upsertLine`, `removeLine`, `clearLines` and `setShippingMethod`. It also supplies the `QUANTITY_LIMIT`, `LINE_LIMIT` and `NO_LINE` sentinels.
- **`./view`** – `readCartLines`, `toCartView` and `isJoined` build the joined lines and the wire view. `./view` is not in the neighbor list but is imported.
- **`../presenter`** – supplies the `CartView` type.
- **`../config`** – `cartLineMax()` gives the per-line quantity ceiling. A neighbor `cartMaxLines()` is mentioned in comments but not imported in the visible content.
- **`../domain`** – `basketWeight` and `needsShipping`, used by the shipping-method validation.
- **`../analytics`, `../audit`** – the `cartAnalyticsEvents` and `cartAuditActions` constants.
- **`@infrastructure/observability/analytics`, `@infrastructure/observability/audit`** – `emitAnalyticsEvent`, `buildAnalyticsBase` and `recordAudit`.
- **`@infrastructure/http/response`** – `generateSuccess` and `generateReject`, plus the `ResponseSuccess` and `ResponseReject` types.
- **`@infrastructure/i18n`** – `t()` supplies the message text for rejections.
- **`./errors`** – imports `shippingMethodNotFound`.
- **`./merge`, `./reorder`** – `trackLineWrite` is shared with the merge. `lineLimitReached` is exported for `./reorder`.

## Notes
- The envelope status is the service's own signal. 201 means the write created the line, and it picks the analytics event. Every route answers 200.
- The catalogue gate lives in `upsertCartItem`, so all single-product callers inherit it, including wishlist move-to-cart. Stock is not checked here, only at checkout.
- The per-line ceiling is checked here for `'set'` and `'update'`. For `'add'` it is enforced by the repository, as is the line-count limit for new lines.
- `cartItemAdd` wraps `cartItemAddById` so that callers with no `CallerContext` (tests, wishlist) can skip analytics.
- `cartItemRemoveById` answers 404 rather than a silent success so that clients with a stale view learn of it. A single repository filter covers both "no cart" and "no such line".
- `cartShippingMethodSet` validation is a UX courtesy. An unknown method answers 404. A digital-only basket or a basket outside the method's weight range answers 409. Checkout re-validates regardless (the comments refer to `resolveShipping` in `services/checkout.ts`).
