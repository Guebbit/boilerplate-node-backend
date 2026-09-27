---
source: src/modules/cart/services/reorder.ts
sha256: 9f2e24a63a95c9836b6c7ffb664e67b92cc913d467de8bfa8d917f59fa2358cd
generated_at: 2026-09-27T14:46:53.021901+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/services/reorder.ts

## Purpose

Implements the "reorder" feature: copies the line items of a past order back into the caller's current cart. It lives in the **cart** module (not orders) because it *writes* to the cart while only *reading* the order, preserving the declared `cart → orders` dependency direction and avoiding a circular import.

## Key elements

- **`reorderIntoCart`** (exported) — orchestrates the full flow: fetch the order via `orderService.getById`, resolve lines against today's catalogue, add them to the cart, return a `CartView`, and emit audit + analytics events on success.
- **`resolveReorderLines`** (private) — resolves each order line's product via `productService.findPublicById`; drops lines whose product is `null` (gone, inactive, or soft-deleted) so a single unavailable item doesn't block the rest.
- **`addLinesToCart`** (private) — adds resolved lines to the caller's cart **sequentially** (to avoid a last-write-wins race on the shared cart document). Clamps each line to `CART_LINE_MAX` minus the existing quantity; skips a line if no room remains. Treats a `QUANTITY_LIMIT` upsert result (concurrent modification) as a skip, not a retry.
- **`ReorderLine`** (internal interface) — a single order line paired with its resolved `ProductDocument | null`.

## Relationships

- **`@modules/orders` / `@modules/orders/model.ts`** — reads an `OrderDocument` through `orderService.getById`; never writes to the orders module.
- **`@modules/cart/repository.ts`** — reads the existing cart (`findByUserId`) and writes lines (`upsertLine`); consumes the `QUANTITY_LIMIT` sentinel.
- **`@modules/cart/model.ts`** — uses `CART_LINE_MAX` for per-line quantity clamping.
- **`@modules/cart/services/view.ts`** — converts the final cart document into a `CartView` for the response.
- **`@modules/cart/analytics.ts` / `audit.ts`** — supplies `cartAnalyticsEvents.CART_REORDERED` and `cartAuditActions.USER_CART_REORDERED` for the success-path observability calls.
- **`@infrastructure/observability/analytics/index.ts`** — `emitAnalyticsEvent` + `buildAnalyticsBase` for product analytics.
- **`@infrastructure/observability/audit.ts`** — `recordAudit` for the audit trail.
- **`@infrastructure/http/response.ts`** — `generateSuccess` / `generateReject` envelope builders.
- **`@infrastructure/http/errors.ts`** — `rejectDatabaseEnvelope` in the `.catch` handler.
- **`@infrastructure/i18n/index.ts`** — `t()` for user-facing message strings.
- **`@modules/cart/services/index.ts`** — barrel re-export surface for this module.

## Notes

- **Scope guard:** the order lookup uses `orderService.ownerScope(userId)` **plus** an explicit `deletedAt: null` filter. `callerScope` is deliberately *not* used because it is role-based (an admin with `orders.any.read` could read any order) — the wrong boundary for "fill *my* cart from *my* history." `ownerScope` alone doesn't exclude soft-deleted orders, hence the extra predicate.
- **Skip vs. refuse semantics:** an individual unavailable line is silently skipped; the request only fails (409 `REORDER_UNAVAILABLE`) when *every* line is unavailable. This contrasts with `./items`' `upsertCartItem`, which refuses per-line.
- **Sequential writes are intentional:** `addLinesToCart` loops with `await` to prevent a last-write-wins race on the single cart document. Do not parallelise the loop.
- **`QUANTITY_LIMIT` is best-effort:** if `upsertLine` returns it (meaning the cart changed concurrently), the line is skipped without retry — the in-memory `quantities` map is considered stale at that point.
