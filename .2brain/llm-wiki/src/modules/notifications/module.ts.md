---
source: src/modules/notifications/module.ts
sha256: 9e1171f318460760a133829ee247814bea2eb3ab329ba5ea452e7988b632682c
generated_at: 2026-10-15T10:50:42.709121+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/module.ts

## Purpose

Module manifest for the **notifications inbox** — one row per message per user, persisted until the owner deletes it, the per-user cap evicts it, or the account is erased. It wires together routes, config, locales, personal-data handlers, and event subscriptions into a single `AppModule` export. The file exists so that the kernel can discover and boot the notifications feature without any producer module ever importing it (the inbox is written *by* domain events, not *for* producers, keeping the dependency graph acyclic).

## Key elements

- **`export default { … } satisfies AppModule`** — The module manifest. Declares `name`, `basePath` (`/notifications`), `routes`, `config`, `personalData`, `subscribe`, and `locales` for the kernel registry.
- **`subscribe`** — Registers four domain-event listeners via `onDomainEvent`:
  - `CART_LINES_REMOVED` → `onCartLinesRemoved`
  - `WISHLIST_ITEMS_REMOVED` → `onWishlistItemsRemoved`
  - `CART_MERGE_REFUSED` → `onCartMergeRefused`
  - `FULFILLMENT_ORDER_DELAYED` → `onFulfillmentOrderDelayed`
- **`personalData`** — Exposes two hooks:
  - `collect` — Calls `notificationsList(userId)` and returns the inbox items for the data-subject-access flow.
  - `erase` — Calls `notificationsDeleteByUserId`, which joins the caller's own hard-delete transaction.
- **`locales`** — Points to `./locales` via `path.join(__dirname, 'locales')`.
- **`config`** — Exposes `notificationsConfig.slice` (the `.slice` is likely a defensive copy of an array of config keys/values).

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/kernel/registry.ts` | Imports `AppModule` type to type the default export. |
| `src/kernel/events.ts` | Imports `onDomainEvent` to subscribe to domain events in `subscribe`. |
| `src/modules/cart/index.ts` | Imports event-name constants `CART_LINES_REMOVED` and `CART_MERGE_REFUSED`. |
| `src/modules/delivery/index.ts` | Imports event-name constant `FULFILLMENT_ORDER_DELAYED`. |
| `src/modules/wishlist/index.ts` | Imports event-name constant `WISHLIST_ITEMS_REMOVED`. |
| `src/modules/notifications/config.ts` | Imports `notificationsConfig` for the `config` field. |
| `src/modules/notifications/routes.ts` | Imports `router` for the `routes` field. |
| `src/modules/notifications/services/index.ts` | Imports all four event handlers plus `notificationsList` and `notificationsDeleteByUserId`. |

Note: the module imports *only* event-name constants from cart, delivery, and wishlist — never their services or routes. No other module imports this file to send a message.

## Notes

- **Producer-blindness is by design.** The JSDoc and the import list both make explicit that no producer module imports this file. If you find a reverse import, it is a bug: it would create a cycle and couple the producer to inbox internals.
- **`erase` shares the caller's transaction.** `notificationsDeleteByUserId` is expected to run inside the same transaction as the account hard-delete; do not wrap it in a separate transaction from the caller side.
- **Event subscription is idempotent by convention of the kernel.** The `subscribe` function is called once at boot; it does not guard against double-registration, so the kernel is responsible for calling it exactly once.
