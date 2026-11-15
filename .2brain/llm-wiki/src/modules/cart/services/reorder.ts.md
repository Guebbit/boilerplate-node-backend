---
source: src/modules/cart/services/reorder.ts
sha256: dac7bdec3323b270be821e4dcc8fbd02d00c7b474c9955c366f6bb311db528e3
generated_at: 2026-11-14T19:32:17.801639+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/services/reorder.ts

## Purpose

Reorders a past order by copying its line items into the caller's current cart. It lives in the cart module (not orders) because it **writes** to the cart and only **reads** the order — keeping the dependency direction `cart → orders` and avoiding a circular `orders → cart` import.

## Key elements

- **`reorderIntoCart(authContext, orderId, context)`** — the sole export. Validates the order belongs to the caller (`ownerScope` + not soft-deleted), maps order items to product/quantity pairs, runs them through `mergeLines`, then returns either a `MergeResult` (success with per-line reasons) or a 409 reject. Emits audit + analytics events on success.

## Relationships

- **`src/modules/orders/index.ts`** — provides `orderService`, used to read the source order via `getById` with `ownLiveScope`. The only cross-module read.
- **`src/modules/cart/services/merge.ts`** — `mergeLines` performs the actual per-line insert/cap/remove logic; this file delegates all cart-mutation semantics to it.
- **`src/modules/cart/services/items.ts`** — `cartGetForBadge` fetches the updated cart for the success payload; `lineLimitReached` provides the structured 409 when every line hit the cart-full condition.
- **`src/modules/cart/analytics.ts`** / **`src/modules/cart/audit.ts`** — supply the `CART_REORDERED` event and `USER_CART_REORDERED` action constants.
- **`src/infrastructure/observability/analytics/index.ts`** (`emitAnalyticsEvent`, `buildAnalyticsBase`) and **`src/infrastructure/observability/audit.ts`** (`recordAudit`) — fire on success only.
- **`src/infrastructure/i18n/index.ts`** (`t`) — localised error messages.
- **`src/infrastructure/http/response.ts`** (`generateSuccess`, `generateReject`, response types) / **`src/infrastructure/http/errors.ts`** (`rejectDatabaseEnvelope`) — response envelope helpers and the database-error fallback.
- **`src/types/auth-context.ts`** — `AuthContext` and `CallerContext` types threaded through the call.

## Notes

- **Scoping is deliberate:** the order lookup uses `orderService.ownLiveScope(userId)` (owner + `deletedAt: null`), *not* `callerScope`. `callerScope` is a role-based read boundary that would let an admin refill their cart from another user's order.
- **409 vs 200 distinction:** a mix of `removed` + `cart_full` lines is still a 409 (`CART_LINE_LIMIT_REACHED`). All-`removed` is a 409 (`REORDER_UNAVAILABLE`). Any line that successfully added (even if others were capped/removed) is a 200 — the `MergeResult.lines` array carries the per-line explanation.
- **`ERROR_CODES`** is imported from `@api/error-codes`, not redefined locally.
- Audit/analytics fire *after* the `.catch` swallows DB errors into a reject envelope, so failures produce no observability events — only successful reorders are recorded.
