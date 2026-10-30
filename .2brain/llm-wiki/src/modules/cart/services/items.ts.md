---
source: src/modules/cart/services/items.ts
sha256: 9de8d686b8ae2561759b6107ee2acd3ca6123b6173fc40ad97473b92c1361944
generated_at: 2026-10-29T03:24:45.030750+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/services/items.ts

## Purpose

Service layer for reading and mutating the lines in a user's cart (add, set, remove, clear) and for selecting the cart's shipping method. Every write returns a priced `CartView` (lines joined with product data), and the three single-product operations carry an HTTP response envelope because they can 404; `cartRemove` is idempotent and returns a bare `CartView`.

## Key elements

- **`cartGet`** — Returns `CartLine[]` for a user, each line joined with its product.
- **`cartGetForBadge` / `cartGetForView`** — Both produce a `CartView` (item count, total qty, total price) via the shared `cartViewOf`. The badge variant is analytics-free; the view variant emits `CART_VIEWED`.
- **`upsertCartItem`** *(internal)* — Shared logic for `'set' | 'add' | 'update'` modes. Gates on catalogue availability (`productService.findPublicById`), enforces the per-line ceiling for `'set'`/`'update'`, and delegates the write to `cartRepository.upsertLine`. Returns 201 if the line was created, 200 if it was modified.
- **`cartItemSetById`** — Mode `'set'`; defaults quantity to 1.
- **`cartItemAddById`** — Mode `'add'`; grows an existing line or creates one.
- **`cartItemAdd`** — Wraps `cartItemAddById` and emits `CART_ITEM_ADDED` or `CART_ITEM_UPDATED` analytics via `emitItemWritten`.
- **`cartItemUpdateQuantity`** — Mode `'update'`; 404 if the line is absent. Wraps `upsertCartItem` + analytics.
- **`trackLineWrite`** / **`emitItemWritten`** — Analytics helpers that pick the correct event based on whether the write created a line (201) or modified one (200).
- **`cartItemRemoveById`** — Removes one line; 404 if absent. Emits audit (`recordAudit`) and analytics (`CART_ITEM_REMOVED`).
- **`cartRemove`** — Clears all lines. Idempotent; always succeeds. Emits `CART_CLEARED`.
- **`cartShippingMethodSet`** — Validates a shipping method against the current basket (digital-only → 409, out-of-weight → 409, unknown → 404). `null` clears the choice and always succeeds.
- **`quantityLimit`** *(internal)* — Builds the shared 422 `CART_QUANTITY_LIMIT` reject.

## Relationships

| Neighbor | Interaction |
|---|---|
| `infrastructure/http/response.ts` | All write operations return `ResponseSuccess<CartView>` or `ResponseReject` built via `generateSuccess` / `generateReject`. |
| `infrastructure/i18n/index.ts` | Every user-facing error message goes through `t()`. |
| `infrastructure/observability/analytics/index.ts` | `emitAnalyticsBase` + `emitAnalyticsEvent` on every cart-level action. |
| `infrastructure/observability/audit.ts` | `recordAudit` fires on `cartItemRemoveById` (the only audited operation here). |
| `modules/cart/analytics.ts` | Supplies the `cartAnalyticsEvents` enum values. |
| `modules/cart/audit.ts` | Supplies the `cartAuditActions` enum values. |
| `modules/cart/config.ts` | `cartLineMax()` provides the per-line quantity ceiling enforced before any write. |
| `modules/cart/domain/index.ts` | `needsShipping` and `basketWeight` gate the shipping-method validation. |
| `modules/cart/presenter.ts` | `CartView` is the resolved shape returned by every read/write. |
| `modules/cart/repository.ts` | `cartRepository` performs all persistence; sentinel returns `QUANTITY_LIMIT` / `NO_LINE` are interpreted here. |
| `modules/cart/services/errors.ts` | `shippingMethodNotFound()` provides the 404 reject for an unknown method. |
| `modules/cart/services/index.ts` | Barrel that re-exports this module's public API. |
| `modules/cart/services/merge.ts` | Shares the same catalogue gate and 201/200 envelope convention for guest-cart merges (referenced in doc comments, not a direct import). |

## Notes

- **201 vs 200 is the service's signal, not the route's.** The envelope status distinguishes "line created" from "line modified" so the analytics layer can pick `CART_ITEM_ADDED` vs `CART_ITEM_UPDATED`. HTTP routes always answer 200.
- **Stock is intentionally not checked here.** It is validated only at checkout, where units are actually held.
- **The per-line ceiling is enforced twice:** in `upsertCartItem` for `'set'`/`'update'` modes, and inside `cartRepository` for `'add'`. Both surface as 422 `CART_QUANTITY_LIMIT`.
- **`cartRemove` has no response envelope** (no reject path), because clearing an already-empty cart is the requested state.
- **`null` clears** is the module-wide convention for optional fields (used for shipping-method selection).
- **`upsertCartItem` is the single catalogue gate.** Any new single-product caller should go through it (or `productService.findPublicById`) so the availability check is inherited automatically.
