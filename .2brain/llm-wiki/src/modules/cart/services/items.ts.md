---
source: src/modules/cart/services/items.ts
sha256: cc7a5024651769644bdb0dcdb8da3bc3f2c71c57d53650339bdd7b6d7a5985b0
generated_at: 2026-11-14T19:31:18.353511+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/services/items.ts

## Purpose

Service-layer operations for reading a cart and mutating its lines (add, set, remove, clear, shipping-method selection). Every write path funnels through a single `upsertCartItem` helper that enforces the catalogue gate, per-line quantity ceiling, and line-count limit, then prices the result via a join. The file also splits the "view the cart" read into a badge-polling variant and a `cart_viewed` analytics variant so analytics intent is encoded at the call site, not inferred from the route.

## Key elements

- **`cartGet`** – raw read: returns `CartLine[]` with product join, no summary, no analytics.
- **`cartGetForBadge`** – read shaped as `CartView` for header-badge polling; intentionally emits no analytics.
- **`cartGetForView`** – same read as badge, wrapped to emit a `CART_VIEWED` analytics event.
- **`upsertCartItem`** *(internal)* – shared write core for modes `'set'` | `'add'` | `'update'`. Gates the product via `productService.findPublicById`, checks `cartLineMax()` for non-add modes, delegates to `cartRepository.upsertLine`, maps sentinel results (`QUANTITY_LIMIT`, `LINE_LIMIT`, `NO_LINE`) to the appropriate reject envelope, and returns 201 vs 200 based on whether the line was created.
- **`cartItemSetById`** – public wrapper calling `upsertCartItem` in `'set'` mode (default qty 1).
- **`cartItemAddById`** – public wrapper calling `upsertCartItem` in `'add'` mode (grows existing line).
- **`cartItemAdd`** – `'add'` mode + `emitItemWritten` analytics wrapper (the `POST /cart/items` path).
- **`cartItemUpdateQuantity`** – `'update'` mode + analytics (the `PATCH /cart/items/{productId}` path; 404 if line absent).
- **`trackLineWrite`** – emits `CART_ITEM_ADDED` or `CART_ITEM_UPDATED` based on the `created` flag; reused by the merge/reorder service.
- **`emitItemWritten`** *(internal)* – inspects the success envelope's status code to decide which analytics event to fire; no-op on rejects.
- **`cartItemRemoveById`** – removes one line; 404 if absent; records an audit entry and emits `CART_ITEM_REMOVED`.
- **`cartRemove`** – clears all lines; idempotent (empty cart → empty view, 200); emits `CART_CLEARED`.
- **`cartShippingMethodSet`** – sets or clears the cart's shipping method (`null` clears). Validates against current basket weight and digital-only state before writing; delegates to `cartRepository.setShippingMethod`.
- **`lineLimitReached`** – exported 409 reject helper (`CART_LINE_LIMIT_REACHED`), also consumed by `./reorder`.
- **`quantityLimit`** *(internal)* – 422 reject helper (`CART_QUANTITY_LIMIT`).

## Relationships

- **`src/modules/cart/repository.ts`** – primary data access: `findByUserId`, `upsertLine`, `removeLine`, `clearLines`, `setShippingMethod`; sentinel constants `QUANTITY_LIMIT`, `LINE_LIMIT`, `NO_LINE` drive error mapping.
- **`src/modules/cart/presenter.ts`** – source of the `CartView` type used as the success payload shape.
- **`src/modules/cart/config.ts`** – `cartLineMax()` supplies the shop-specific per-line quantity ceiling checked before any write.
- **`src/modules/cart/domain/index.ts`** – `basketWeight` and `needsShipping` are used inside `cartShippingMethodSet` for weight/digital validation.
- **`src/modules/cart/analytics.ts`** – `cartAnalyticsEvents` provides the event-name constants (`CART_VIEWED`, `CART_ITEM_ADDED`, `CART_ITEM_UPDATED`, `CART_ITEM_REMOVED`, `CART_CLEARED`).
- **`src/modules/cart/audit.ts`** – `cartAuditActions` provides the `USER_CART_ITEM_REMOVED` action constant.
- **`src/infrastructure/observability/analytics/index.ts`** – `emitAnalyticsEvent` / `buildAnalyticsBase` are the analytics sink.
- **`src/infrastructure/observability/audit.ts`** – `recordAudit` logs the removal action.
- **`src/infrastructure/http/response.ts`** – `generateSuccess` / `generateReject` and the `ResponseSuccess` / `ResponseReject` types shape every return.
- **`src/infrastructure/i18n/index.ts`** – `t()` translates user-facing error messages.
- **`src/modules/cart/services/errors.ts`** – `shippingMethodNotFound` reject helper used in the shipping-method path.
- **`src/modules/cart/services/merge.ts`** – consumes `trackLineWrite` and `lineLimitReached` exported from this file; goes through a different rule path (reports unavailable lines rather than refusing outright).
- **`src/modules/cart/services/index.ts`** – barrel that re-exports the public functions from this file.

## Notes

- **Envelope status ≠ HTTP status.** `upsertCartItem` returns 201 in the *envelope* when a line is created, but every HTTP route answers 200 because the cart is the parent resource (no `Location` header). Callers read `result.status` for analytics branching, not for the HTTP response.
- **Two read exports, one query.** `cartGetForBadge` and `cartGetForView` call the same `cartViewOf`; the only difference is the analytics emit. Adding a third caller with different intent means another thin wrapper here, not a new repository call.
- **Stock is intentionally absent.** `upsertCartItem` checks catalogue visibility and quantity/line limits but does *not* check stock. Stock is enforced only at checkout, where units are actually held.
- **`'update'` is `'set'` minus create.** A cart without the named line returns 404 in `'update'` mode; `'set'` would have created it.
- **`cartRemove` carries no reject envelope.** Clearing an already-empty cart is the desired end-state, so the function always resolves to a `CartView` (200) and never rejects.
- **Shipping-method validation is advisory.** `cartShippingMethodSet` checks weight/digital constraints as a UX courtesy; `services/checkout.ts` re-validates from scratch at the point of no return.
