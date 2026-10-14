---
source: src/modules/cart/services/items.ts
sha256: 65a8c89749ca07050ae67bf15b43fceb0f8477ca519c491951b02aed3675ad50
generated_at: 2026-10-14T15:11:47.580664+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/services/items.ts

## Purpose

Service-layer functions that read and mutate a user's cart contents: add, set, remove, and clear product lines, plus selecting (or clearing) a shipping method. Sits between HTTP controllers and the repository, layering the catalogue gate, per-line quantity limits, response envelopes (200/201/404/422/409), analytics emission, and audit recording on top of raw repository calls.

## Key elements

- **`cartGet`** – Read all cart lines joined with their products.
- **`cartGetForBadge` / `cartGetForView`** – Two aliases over the same read; the *view* variant emits `CART_VIEWED` analytics, the *badge* variant does not.
- **`cartItemSetById`** (mode `'set'`) / **`cartItemAddById`** (mode `'add'`) – Core upsert; checks catalogue availability and per-line max, returns a `ResponseSuccess<CartView>` (201 created / 200 updated) or `ResponseReject`.
- **`cartItemAdd` / `cartItemUpdateQuantity`** – Controller-facing wrappers that add the `CallerContext`-bound analytics emit (`CART_ITEM_ADDED` vs `CART_ITEM_UPDATED`) on top of the core upsert.
- **`cartItemRemoveById`** – Delete one line; 404 if the line (or cart) is missing; emits `CART_ITEM_REMOVED` analytics and an audit record.
- **`cartRemove`** – Clear all lines; idempotent; returns a bare `CartView` (no envelope) because an already-empty cart is a valid success.
- **`cartShippingMethodSet`** – Persist or clear (`null`) a shipping method; validates the method exists (404), the basket needs shipping (409), and the method fits the basket weight (409).
- **`upsertCartItem`** *(private)* – Shared add/set pipeline: catalogue gate → quantity-limit check → `cartRepository.upsertLine` → `toCartView` → envelope.
- **`emitItemWritten`** *(private)* – Fire-and-return helper that maps the 201/200 status to the correct analytics event.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/cart/repository.ts` | All reads/writes go through `cartRepository` (`findByUserId`, `upsertLine`, `removeLine`, `clearLines`, `setShippingMethod`); `QUANTITY_LIMIT` sentinel is inspected from `upsertLine`. |
| `src/modules/cart/services/view.ts` | `readCartLines`, `toCartView`, `isJoined` and the `CartLine` / `CartView` types are reused for every response shape. |
| `src/modules/cart/config.ts` | `cartLineMax()` supplies the per-line quantity ceiling for `'set'` mode. |
| `src/modules/cart/domain/index.ts` | `basketWeight` and `needsShipping` are used to validate shipping-method selection. |
| `src/modules/cart/analytics.ts` | `cartAnalyticsEvents` provides the event-name constants (`CART_VIEWED`, `CART_ITEM_ADDED`, …). |
| `src/modules/cart/audit.ts` | `cartAuditActions` provides the action constant for `CART_ITEM_REMOVED`. |
| `src/infrastructure/http/response.ts` | `generateSuccess` / `generateReject` build every response envelope; `ResponseSuccess` / `ResponseReject` are the return types. |
| `src/infrastructure/i18n/index.ts` | `t()` localises all user-facing error messages. |
| `src/infrastructure/observability/analytics/index.ts` | `emitAnalyticsEvent` / `buildAnalyticsBase` fire every analytics event. |
| `src/infrastructure/observability/audit.ts` | `recordAudit` writes the single audit record (on `cartItemRemoveById`). |
| `@modules/products` *(external)* | `productService.findPublicById` enforces the catalogue gate inside `upsertCartItem`. |
| `@modules/delivery` *(external)* | `findShippingMethod` and `methodFitsWeight` validate the chosen shipping method. |

## Notes

- **No envelope on `cartRemove`.** The module doc explicitly states that clearing an already-empty cart is the state the caller asked for, so the function returns `Promise<CartView>` rather than a `ResponseSuccess | ResponseReject`.
- **Badge vs. view split is analytics-only.** Both call the identical read; the distinction exists solely so a `cart_viewed` event fires once per human session, not per header poll.
- **Stock is intentionally absent.** Availability is gated by `findPublicById`; unit-level stock is checked only at checkout.
- **Two different 422 paths.** `'set'` mode checks `cartLineMax()` *before* writing; `'add'` mode relies on the repository returning the `QUANTITY_LIMIT` sentinel. Both map to the same `CART_QUANTITY_LIMIT` code.
- **`null` clears shipping method.** Passing `null` to `cartShippingMethodSet` skips all validation and unconditionally succeeds (D17c "null clears" convention).
- **Checkout re-validates shipping.** The validation here is a UX courtesy; `services/checkout.ts` re-runs its own `resolveShipping` independently.
