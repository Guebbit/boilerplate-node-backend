---
source: src/modules/notifications/services/subscribers.ts
sha256: 2c7d170cb1ddd18cd50e8b8176eec7b75e503eb6b3c0cd6740a5ef45bef6bfd4
generated_at: 2026-10-15T10:52:06.917194+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/services/subscribers.ts

## Purpose

Maps domain events to inbox notification rows. Each exported function is a thin adapter: it takes a typed event payload, shapes it into one or more `NewNotification` objects, and hands them to `notificationsCreate` in `./inbox`. The module's `subscribe()` call (lived in `module.ts`) wires these functions to the event bus; the actual persistence stays in `inbox.ts`.

## Key elements

- **`removedFor`** (private helper) — Builds an array of `NewNotification` rows, one per `userId`, for the two "item removed" event shapes. Accepts a `code` discriminator so the same logic serves both cart-line and wishlist removal.
- **`onCartLinesRemoved`** — Handler for `cart.lines_removed`; delegates to `removedFor` with code `notifications.cart-line-removed`.
- **`onWishlistItemsRemoved`** — Handler for `wishlist.items_removed`; delegates to `removedFor` with code `notifications.wishlist-item-removed`.
- **`onCartMergeRefused`** — Handler for `cart.merge_refused`; writes a single notification listing all refused lines.
- **`onFulfillmentOrderDelayed`** — Handler for `fulfillment_order.delayed`; picks the notification code based on `needsAnswer` (`preorder-confirm-wait` vs `preorder-delayed`). Includes `expectedAt` / `answerBy` in `params` only when present. Resolves immediately (no write) when `userId` is `undefined` (erased account).

## Relationships

- **`src/kernel/events.ts`** — Imports `DomainEventMap` as the type source for every payload parameter.
- **`src/modules/notifications/repository.ts`** — Imports the `NewNotification` type that defines the row shape produced by each handler.
- **`src/modules/notifications/services/inbox.ts`** — Calls `notificationsCreate`, which performs the actual database write.
- **`src/modules/notifications/module.ts`** — Registers these exported handlers on the event bus via the module's `subscribe()` wiring.
- **`src/modules/notifications/services/index.ts`** — Barrel file that re-exports these handlers (and other service exports) for external import.

## Notes

- Every notification written here uses `severity: 'warning'` by design — the module docblock states these are "something changed without you asking," not errors.
- `onFulfillmentOrderDelayed` is the only handler that can be a no-op (undefined `userId`); callers should not assume a write always occurs.
- The conditional spread for `expectedAt` and `answerBy` means downstream consumers must treat those params as optional even when the event type marks them as possibly-present.
- `removedFor` is intentionally unexported; the two removal handlers are the only public surface for that shared logic.
