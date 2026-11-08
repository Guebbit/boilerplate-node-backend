---
source: src/modules/cart/services/reorder.ts
sha256: 36e01ff748bbd5f9a9810406a9718e2c32d638300f0539f6ad9fed55523c3c11
generated_at: 2026-11-08T05:18:05.808827+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/services/reorder.ts

## Purpose

Provides a single operation — `reorderIntoCart` — that copies a past order's line items back into the caller's current cart. It lives in the cart module (not orders) because it **writes** to the cart while only **reading** the order, keeping the dependency direction `cart → orders` and avoiding the circular edge a `/orders/{id}/reorder` route would force.

## Key elements

- **`reorderIntoCart(authContext, orderId, context)`** — The sole export. Looks up the caller's own, non-deleted order, maps its items to `{ productId, quantity }`, runs them through `mergeLines`, and returns:
  - `200` with `{ cart, lines }` (the badge payload + per-line merge report) when at least one line survived.
  - `404` if the order doesn't exist or isn't visible to the caller.
  - `409` with code `REORDER_UNAVAILABLE` when **every** line was `removed` (product gone or hidden).
  - A standard DB-error envelope on unexpected failures.
  - On success, emits an analytics event (`CART_REORDERED`) and records an audit entry (`USER_CART_REORDERED`).

## Relationships

| Neighbor | Interaction |
|---|---|
| `@modules/orders` (orders/index) | Reads the order via `orderService.getById` with `ownLiveScope(userId)`. |
| `./merge` | Delegates line reconciliation to `mergeLines`; consumes its `MergeResult` per-line reasons. |
| `./items` | Calls `cartGetForBadge` to attach the up-to-date cart snapshot to the success response. |
| `@infrastructure/http/response` | Shapes every return via `generateSuccess` / `generateReject`. |
| `@infrastructure/http/errors` | Wraps unexpected throwables with `rejectDatabaseEnvelope`. |
| `@infrastructure/i18n` | Localises the 404 and 409 user-facing messages. |
| `@infrastructure/observability/analytics` | Fires `CART_REORDERED` with `buildAnalyticsBase` on success. |
| `@infrastructure/observability/audit` | Records `USER_CART_REORDERED` audit row on success. |
| `../analytics`, `../audit` | Supplies the event/action name constants used above. |
| `@types` (auth-context) | Types the `AuthContext` and `CallerContext` parameters. |
| `@api/error-codes` | Provides `ERROR_CODES.REORDER_UNAVAILABLE` for the 409 body. |

## Notes

- **Scope distinction:** The query uses `ownLiveScope` (owner + `deletedAt: null`), **not** `callerScope`. `callerScope` is role-based (an admin with `display:Order` could see *any* order); that boundary is intentionally too broad for a "fill **my** cart from **my** history" feature.
- **`capped` is not an error:** A line exceeding `cartLineMax()` is trimmed to the remaining room and reported as `capped` in the merge result. Only an all-`removed` outcome produces a 409.
- **Audit/analytics fire after the promise settles**, not inside the merge callback, so a merge failure (e.g., DB error) is never mistakenly recorded as a success.
- The file is re-exported through `services/index.ts`; import from the barrel in other modules.
