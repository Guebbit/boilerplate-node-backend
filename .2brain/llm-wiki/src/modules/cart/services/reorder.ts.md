---
source: src/modules/cart/services/reorder.ts
sha256: 0ed6c2eec01821834228bca94abedc056606359cc9f8dc6abd7a05e19ee2cc62
generated_at: 2026-10-14T15:12:57.332835+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/services/reorder.ts

## Purpose

Implements the "reorder" feature: takes a past order's items, re-resolves them against the current product catalogue, and fills the caller's cart with whatever is still available. It lives in the **cart** module (not orders) because it *writes* to the cart and only *reads* the order — keeping the dependency direction `cart → orders` that the module manifests declare.

## Key elements

- **`reorderIntoCart(authContext, orderId, context)`** — The sole export. Orchestrates the full flow: fetches the order (owner-scoped, non-deleted), resolves its lines, adds them to the cart, returns a `CartView`, and emits audit + analytics on success.
- **`resolveReorderLines(order)`** (internal) — Maps each order item to a `ReorderLine` by calling `productService.findPublicById`. Filters out lines whose product is gone/inactive/soft-deleted. Returns only addable lines.
- **`addLinesToCart(userId, lines)`** (internal) — Sequentially upserts each line into the user's cart via `cartRepository.upsertLine`, clamping quantity to remaining room under `cartLineMax()`. Tracks a local quantity map to avoid re-reading the cart per line.
- **`ReorderLine`** (internal interface) — A single order line paired with its (possibly `null`) resolved product.

## Relationships

- **`src/modules/orders/index.ts` / `model.ts`** — Reads an order via `orderService.getById` with `ownerScope`; consumes the `OrderDocument` type.
- **`src/modules/cart/repository.ts`** — Primary write target (`upsertLine`, `findByUserId`) and source of the `QUANTITY_LIMIT` sentinel.
- **`src/modules/cart/config.ts`** — Supplies `cartLineMax()` used to clamp per-line quantities.
- **`src/modules/cart/services/view.ts`** — Transforms the final cart document into the `CartView` returned to the caller.
- **`src/modules/cart/analytics.ts` / `audit.ts`** — Provide the named event/action constants (`CART_REORDERED`, `USER_CART_REORDERED`) logged on success.
- **`src/infrastructure/observability/analytics/index.ts` / `audit.ts`** — `emitAnalyticsEvent` and `recordAudit` fire after a successful reorder.
- **`src/infrastructure/http/response.ts` / `errors.ts`** — Shapes the success/reject envelopes; `rejectDatabaseEnvelope` handles unexpected DB errors.
- **`src/infrastructure/i18n/index.ts`** — `t()` supplies user-facing messages for 404, 409, and success cases.

## Notes

- **Scoping is deliberate and non-obvious.** The order is fetched with `ownerScope(userId)` **plus** `deletedAt: null`. `ownerScope` alone (unlike `callerScope`) does not exclude soft-deleted orders, and `callerScope` would be wrong here because it is a *role*-based read boundary — an admin with `orders.any.read` must not be able to reorder a stranger's purchase into their own cart.
- **Sequential writes are required, not an optimisation.** Each `upsertLine` reads-and-rewrites the same cart document; parallel calls would hit a last-write-wins race. The local `quantities` Map exists precisely because the writes are serial.
- **Unavailable ≠ refused.** A single vanished product is silently skipped. Only when *zero* lines survive does the handler return 409 `REORDER_UNAVAILABLE`. This contrasts with `./items`' `upsertCartItem`, which refuses the request.
- **`QUANTITY_LIMIT` from `upsertLine` is treated as a concurrent-mutation signal.** The local quantity map is stale; the line is skipped (not retried) as best-effort.
- **Quantity clamping is best-effort.** A line requesting more than `cartLineMax()` gets only the remaining room; if room is zero the line is skipped entirely — same treatment as an unavailable product, not an error.
