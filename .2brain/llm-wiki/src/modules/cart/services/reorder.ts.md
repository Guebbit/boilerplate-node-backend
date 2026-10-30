---
source: src/modules/cart/services/reorder.ts
sha256: 36e01ff748bbd5f9a9810406a9718e2c32d638300f0539f6ad9fed55523c3c11
generated_at: 2026-10-29T03:25:34.021967+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/services/reorder.ts

## Purpose

Copies an order's product lines back into the caller's cart. It lives in the cart module (not orders) because the *write* target is the cart; the order is only read. Placing it here preserves the declared `cart → orders` dependency direction and avoids forcing the orders module to reach into cart state.

## Key elements

- **`reorderIntoCart(authContext, orderId, context)`** — The sole export. Resolves the order via `orderService.getById` scoped to the caller's own live orders, maps items to `{ productId, quantity }`, runs them through `mergeLines`, and returns either a `200` with `{ cart, lines }` (where `cart` comes from `cartGetForBadge`) or a `409 REORDER_UNAVAILABLE` if every line was removed. A `404` is returned for a not-found order. On success it records an audit entry (`USER_CART_REORDERED`) and emits an analytics event (`CART_REORDERED`).

## Relationships

- **`src/modules/orders/index.ts`** — Provides `orderService`, whose `getById` + `ownLiveScope(userId)` supply the order to be re-ordered.
- **`src/modules/cart/services/merge.ts`** — `mergeLines` performs the actual per-line merge (capping, removal) and returns the `MergeResult` shape included in the response.
- **`src/modules/cart/services/items.ts`** — `cartGetForBadge` fetches the post-merge cart state for the badge portion of the response.
- **`src/modules/cart/analytics.ts` / `audit.ts`** — Supply the `cartAnalyticsEvents.CART_REORDERED` and `cartAuditActions.USER_CART_REORDERED` constants used in the success path.
- **`src/infrastructure/http/response.ts`** — `generateSuccess` / `generateReject` build the typed HTTP response envelopes.
- **`src/infrastructure/http/errors.ts`** — `rejectDatabaseEnvelope` is the `.catch` handler for unexpected DB errors.
- **`src/infrastructure/i18n/index.ts`** — `t()` translates the user-facing error messages.
- **`src/infrastructure/observability/analytics/index.ts`** — `emitAnalyticsEvent` / `buildAnalyticsBase` for the analytics fire-and-forget.
- **`src/infrastructure/observability/audit.ts`** — `recordAudit` writes the audit log entry.
- **`src/types/auth-context.ts`** — `AuthContext` and `CallerContext` parameter types.
- **`src/modules/cart/services/index.ts`** — Barrel re-export for consumers of the cart services.

## Notes

- **`ownerScope` vs `callerScope`:** The function deliberately uses `ownLiveScope` (owner + `deletedAt: null`). `callerScope` is a *role-based* read boundary (an admin's `display:Order` reads every order) and would let an admin refill their cart from another user's purchase. `ownerScope` alone does **not** exclude soft-deleted orders, so the explicit `deletedAt: null` is required.
- **409 vs empty 200:** If *every* requested line ends up `removed`, the response is `409 REORDER_UNAVAILABLE` — not a 200 with an empty line list. Individual `removed` or `capped` lines in a partially successful reorder are **not** errors.
- **No direct write to cart in this file:** The actual cart mutation happens inside `mergeLines`; this file only orchestrates fetch → merge → respond → observe.
