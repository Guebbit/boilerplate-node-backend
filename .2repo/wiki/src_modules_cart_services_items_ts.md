# src/modules/cart/services/items.ts

## Purpose

Service layer for reading and mutating cart lines. Every exported operation performs a single write (or read) against `cartRepository` and then joins the result with product data to produce a priced `CartView`. Single-product mutations carry a `ResponseSuccess | ResponseReject` envelope; `cartRemove` and the badge/view reads do not, because they cannot fail.

## Key elements

- **`cartGet(userId)`** — Reads cart lines joined with their product. Returns `CartLine[]`.
- **`cartViewOf(userId)`** *(private)* — Reads cart and computes summary (item count, total quantity, total price) via `toCartView`.
- **`cartGetForBadge`** — Alias of `cartViewOf`. No analytics; used by the header badge poll.
- **`cartGetForView(userId, context)`** — Same read as badge but emits `CART_VIEWED` analytics.
- **`upsertCartItem(userId, id, quantity, mode)`** *(private)* — Shared write path. Gate-keeps via `productRepository.findPublicById` (404 if not public), then calls `cartRepository.upsertLine`.
- **`cartItemSetById(userId, id, quantity?)`** — Sets quantity (mode `'set'`). No analytics; the analytics-free core.
- **`cartItemAdd(userId, id, quantity, context)`** — Wraps `cartItemSetById`; on success emits `CART_ITEM_ADDED`.
- **`cartItemUpdateQuantity(userId, id, quantity, context)`** — Wraps `cartItemSetById`; on success emits `CART_ITEM_UPDATED`.
- **`cartItemAddById(userId, id, quantity?)`** — Increments quantity (mode `'add'`). No analytics.
- **`cartItemRemoveById(userId, id, context)`** — Removes a line. Returns 404 reject if the line is absent. Emits audit + `CART_ITEM_REMOVED` analytics on success.
- **`cartRemove(userId, context)`** — Clears all lines. Idempotent (empty cart → empty view, no error). Emits `CART_CLEARED`. Returns bare `CartView`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/cart/repository.ts` | Primary data access: `findByUserId`, `upsertLine`, `removeLine`, `clearLines`. |
| `src/modules/cart/services/view.ts` | `readCartLines`, `toCartView`, `CartLine`, `CartView` — shapes raw cart documents into priced views. |
| `src/modules/products/index.ts` | `productRepository.findPublicById` — catalogue/availability gate before any single-product write. |
| `src/infrastructure/http/response.ts` | `generateSuccess` / `generateReject` / `ResponseSuccess` / `ResponseReject` — response envelopes for mutating ops. |
| `src/infrastructure/http/request.ts` | `CallerContext` type — passed into analytics/audit emitters. |
| `src/infrastructure/i18n/index.ts` | `t()` for the 404 "product not found" message. |
| `src/infrastructure/observability/analytics/index.ts` | `emitAnalyticsEvent`, `buildAnalyticsBase` — all cart analytics emissions. |
| `src/infrastructure/observability/audit.ts` | `emitAuditEvent`, `buildAuditEvent` — audit trail for `cartItemRemoveById`. |
| `src/modules/cart/analytics.ts` | `cartAnalyticsEvents` — event-name constants. |
| `src/modules/cart/audit.ts` | `cartAuditActions` — audit action constants. |
| `src/modules/cart/services/index.ts` | Barrel that re-exports these functions. |

## Notes

- **Stock is deliberately not checked here.** Availability is gated by `findPublicById`; actual stock is enforced at checkout only.
- **`cartItemAdd` vs `cartItemUpdateQuantity`** differ *only* in the analytics event name (`ADDED` vs `UPDATED`); both call the same `'set'` upsert.
- **`cartItemAddById`** uses mode `'add'` (increment), while `cartItemSetById` / `cartItemAdd` / `cartItemUpdateQuantity` use `'set'` (replace).
- **`cartRemove` has no envelope** — clearing an already-empty cart is a valid state, so it returns a plain `CartView` rather than a success/reject pair.
- **Success envelopes carry no message.** The caller (controller) is responsible for any user-facing text.
- **`cartItemRemoveById` returns 404** when the line is absent rather than silently succeeding, so a client can detect a stale view.
