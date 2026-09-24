---
source: src/modules/cart/services/reorder.ts
sha256: 799e5e26a13ab7c9ca913c7914e5abee6239de89e0e492e475dcdbd14fc4e413
generated_at: 2026-09-23T18:32:56.396732+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/services/reorder.ts

## Purpose

Implements the "reorder" action: reads an existing order's line items and copies them back into the caller's cart. It lives in the cart module (not orders) because it _writes_ to the cart; the order is only read. Placing it here preserves the `cart → orders` dependency direction declared by the module manifests and avoids the cycle that a cart-reaching-into-orders path would create.

## Key elements

- **`reorderIntoCart(authContext, orderId, context)`** — The sole export. Loads the caller's own, non-deleted order, re-resolves each line against the live catalogue, then sequentially upserts addable lines into the cart. Returns `ResponseSuccess<CartView>` (200) or `ResponseReject` (404 / 409).
- **`ReorderLine` (local interface)** — A resolved order line paired with its current `ProductDocument | null`; `null` means the product is gone/inactive and the line is skipped.

## Relationships

| Neighbor                                                        | Interaction                                                                  |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `@modules/orders` (`orderService.getById`)                      | Reads the order using `ownerScope` + `deletedAt: null`.                      |
| `@modules/products` (`productService.findPublicById`)           | Re-resolves each product id against today's catalogue.                       |
| `@modules/cart/repository` (`cartRepository`, `QUANTITY_LIMIT`) | Reads the existing cart and performs sequential `upsertLine` writes.         |
| `@modules/cart/model` (`CART_LINE_MAX`)                         | Per-line quantity ceiling used to clamp/skip lines.                          |
| `@modules/cart/services/view` (`toCartView`)                    | Converts the final cart document into the `CartView` returned to the caller. |
| `@infrastructure/http/response`                                 | `generateSuccess` / `generateReject` shape the HTTP envelopes.               |
| `@infrastructure/http/errors`                                   | `rejectDatabaseEnvelope` catches unexpected DB errors in the `.catch` tail.  |
| `@infrastructure/i18n`                                          | `t()` supplies user-facing messages (not-found, unavailable, success).       |
| `@infrastructure/observability/analytics`                       | `emitAnalyticsEvent` + `buildAnalyticsBase` fire on success.                 |
| `@infrastructure/observability/audit`                           | `recordAudit` logs the action on success.                                    |
| `@modules/cart/analytics`                                       | Provides the `cartAnalyticsEvents.CART_REORDERED` constant.                  |
| `@modules/cart/audit`                                           | Provides the `cartAuditActions.USER_CART_REORDERED` constant.                |
| `@modules/cart/services/index.ts`                               | Re-exports `reorderIntoCart` for external consumers.                         |

## Notes

- **`ownerScope`, not `callerScope`.** `callerScope` is role-based (an admin with `orders.any.read` sees _every_ order). Reorder must be scoped to the caller's _own_ history; `deletedAt: null` is added explicitly because `ownerScope` does not carry it.
- **Sequential writes.** Each `upsertLine` reads-and-rewrites the same cart document; parallel calls would lose lines to a last-write-wins race. The loop also lets the local `quantities` map stay authoritative without a re-read per line.
- **Dual `_id` / `id` on embedded products.** `orderService.getById` returns normalized output where the snapshot's `_id` is already aliased to `id`, but the static type still carries `_id`. The code reads both spellings (`snapshot.id ?? snapshot._id`) rather than casting—this is a known two-shapes trap of `getById`.
- **Skip, don't refuse, for unavailable products.** A line whose product is missing is silently dropped (best-effort). Only when _every_ line is unavailable does the function return 409 `REORDER_UNAVAILABLE`. This contrasts with `./items`' `upsertCartItem`, which hard-refuses.
- **`QUANTITY_LIMIT` sentinel.** If `upsertLine` returns this, a concurrent write has already shifted the cart; the line is skipped rather than retried (best-effort semantics).
