---
source: src/modules/orders/services/availability.ts
sha256: c2cc6316a839838acf3134bcec8a86d63882e1289c2967080ec59ff49b7ecd8b
generated_at: 2026-09-23T19:06:01.426719+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/availability.ts

## Purpose

Determines whether an order's product lines are still sellable by re-querying live product state (rather than trusting the order's frozen snapshot), and executes the consequence when a product has been hard-deleted or deactivated: cancel every still-pending order holding that product and send the buyer an explanatory email.

## Key elements

- **`UnavailableLine`** (interface) — `{ productId, title }` for a line whose product is no longer purchasable.
- **`OrderLineSource`** (interface) — Minimal structural type covering both the hydrated `OrderDocumentItem` (`product._id`) and the wire `OrderItem` (`product.id`) shapes. Exported only so `unavailableLines`'s signature can name it.
- **`productIdOf`** (internal) — Extracts the product id from either spelling (`id ?? _id`), normalizing to `string`.
- **`unavailableLines`** (exported) — Given an order's `items`, calls `productService.findManyByIds`, filters for products where `active && !deletedAt`, and returns the subset of lines that are _not_ in that sellable set.
- **`cancelPendingOrdersHolding`** (exported) — Finds all `pending` orders for a product, cancels each via `cancelById` with `SYSTEM_ACTOR`, looks up the buyer's locale, and enqueues a `productUnavailableCancelledEmail`. Individual cancellations that fail are caught and logged without aborting the batch.

## Relationships

- **`@modules/products` (index → service)** — `productService.findManyByIds` is the single source of truth for current sellability; unscoped so hard-deleted products simply return nothing.
- **`@modules/orders/repository`** — `orderRepository.findPendingByProductId` locates the orders to cancel.
- **`@modules/orders/services/cancel`** — `cancelById` performs the actual state transition; this file deliberately uses its own email path (not cancel's reservation-expiry email).
- **`@modules/orders/emails`** — `productUnavailableCancelledEmail` supplies the subject, template, and data for the buyer notification.
- **`@modules/users` (index)** — `userService.getById` fetches the buyer's locale for i18n; falls back to `getDefaultLocale`.
- **`@infrastructure/i18n`** — `getDefaultLocale` as the locale fallback.
- **`@infrastructure/adapters/mailer`** — `enqueueEmail` dispatches the notification.
- **`@infrastructure/adapters/logger`** — Logs individual cancellation failures.
- **`@kernel/permissions`** — `SYSTEM_ACTOR` is the actor passed to `cancelById` (cancellation is system-initiated, not buyer-initiated).
- **`@modules/orders/module`** (caller, not imported here) — The `PRODUCT_DELETED` and `PRODUCT_DEACTIVATED` event listeners invoke `cancelPendingOrdersHolding`.
- **`@modules/orders/services/index`** — Re-exports this module for consumers.

## Notes

- **Two-shapes trap:** `OrderLineSource` exists because a scoped read (`findByIdScoped` → `applyOrderTransform`) rewrites `_id` to `id`, while an unscoped/admin read keeps `_id`. `productIdOf` handles both; the same issue is noted in `cart/services/reorder.ts`.
- **Visibility is decided locally:** `productService.findManyByIds` is unscoped (a hard-deleted product returns no row), so `unavailableLines` re-applies the `active && !deletedAt` filter itself rather than relying on scoped product queries.
- **Email is always sent on success:** Unlike `cancel.ts`'s reservation-expiry email (card-only, `bank_transfer`-gated), this file emails every successfully cancelled order—card included—because the buyer had no prior warning.
- **Fault isolation:** Each order cancellation runs in its own `.catch`; one failure logs and continues, never blocking the remaining orders in the batch.
