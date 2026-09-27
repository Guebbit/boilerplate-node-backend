---
source: src/modules/orders/services/availability.ts
sha256: 2862dd7024cc61d6469e2f96bb48648cf7635ecfa3c9ae2f43eb7abdf69b9e3b
generated_at: 2026-09-27T15:12:54.129785+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/availability.ts

## Purpose

Determines whether the product lines on an order are still sellable (hard-deleted, soft-deleted, or deactivated) and, when a product stops being sellable, cancels all still-pending orders that hold it and notifies each buyer. It exists because the `active`/`deletedAt` fields frozen on an order line describe purchase-time state, not current state, so a live query to the product service is required.

## Key elements

- **`UnavailableLine`** (interface) — the shape of a single line whose product can no longer be purchased: `productId` and `title`.
- **`productIdOf`** (private helper) — extracts the embedded product `_id` from an `OrderDocumentItem`; always uses the snapshot's own `_id`.
- **`unavailableLines`** (exported function) — given an order's `items`, queries `productService.findManyByIds` (unscoped), applies the `active && !deletedAt` filter here, and returns the subset of lines whose product is gone.
- **`cancelPendingOrdersHolding`** (exported function) — finds all pending orders containing `productId`, cancels each via `cancelById` as `SYSTEM_ACTOR`, then looks up the buyer's locale and enqueues a `productUnavailableCancelledEmail`. Failures on individual orders are caught and logged without aborting the batch.

## Relationships

- **`@modules/products`** (`productService`) — `unavailableLines` calls `findManyByIds` to get the current state of the referenced products.
- **`@modules/users`** (`userService`) — `cancelPendingOrdersHolding` calls `getById` to resolve the buyer's preferred locale for the email.
- **`../repository`** (`orderRepository`) — `cancelPendingOrdersHolding` calls `findPendingByProductId` to discover affected orders.
- **`./cancel`** (`cancelById`) — reused to perform the actual cancellation with `SYSTEM_ACTOR`.
- **`../emails`** (`productUnavailableCancelledEmail`) — provides the i18n-aware subject/template/data for the buyer notification.
- **`../model`** (`OrderDocumentItem`) — type-only import for the order line shape.
- **`@kernel/permissions`** (`SYSTEM_ACTOR`) — the actor identity used when cancelling on the buyer's behalf.
- **`@infrastructure/adapters/mailer`** (`enqueueEmail`) — dispatches the cancellation email.
- **`@infrastructure/adapters/logger`** (`logger`) — logs a structured error when an individual cancellation fails.
- **`@infrastructure/i18n`** (`getDefaultLocale`) — fallback locale when the buyer has no stored preference.
- **`../module.ts`** — the `PRODUCT_DELETED` and `PRODUCT_DEACTIVATED` event listeners are the upstream callers of `cancelPendingOrdersHolding`.

## Notes

- The `active`/`deletedAt` visibility check is intentionally performed **in this file**, not via a scoped repository query. `findManyByIds` is unscoped so that a hard-deleted product (which returns no document at all) is distinguishable from a merely hidden one.
- `cancelPendingOrdersHolding` sends a **dedicated** email (`productUnavailableCancelledEmail`), not the reservation-expiry email in `cancel.ts`, because this is an unscheduled event that always warrants an explanation regardless of payment method.
- Each order's cancellation is wrapped in its own `.catch`; a single race or write-conflict failure is logged and skipped without blocking the remaining orders.
- `productIdOf` reads `item.product._id` specifically — not a denormalised `productId` field — because the hydrated document always carries the embedded `_id`.
