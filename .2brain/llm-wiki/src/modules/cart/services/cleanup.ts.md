---
source: src/modules/cart/services/cleanup.ts
sha256: 28b260e7699fcd5ac6d7221a83b110d532038897f068f01149eaab14f59e92da
generated_at: 2026-10-14T15:11:09.117124+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/services/cleanup.ts

## Purpose

Provides the two external cleanup entry points for the cart module: one for hard-deleting a user's cart (called as a `personalData.erase` hook from another module's transaction) and one for removing a product from all carts (subscribed as a domain-event handler). Neither is reachable from a cart route; they exist because a cart references a user and a product it does not own, and no other code tidies up after either.

## Key elements

- **`cartDeleteByUserId(userId, session)`** — Deletes a user's cart document via `cartRepository.deleteByUserId`. Accepts a Mongoose `ClientSession` so the delete participates in the caller's hard-delete transaction. A thrown error aborts that transaction (it is a synchronous hook, not an event handler).
- **`productRemoveFromCartsById(id, titles)`** — Calls `cartRepository.removeProductFromAll(id)`. If one or more carts contained the product, emits a `CART_LINES_REMOVED` domain event carrying `userIds`, `productId`, and locale `titles`. Returns immediately (no-op) when no carts were affected. Designed as an async event handler; a rejected promise is what `emitDomainEvent` reads to log handler failure.

## Relationships

- **`src/modules/cart/repository.ts`** — Both functions delegate their data-access work to `cartRepository` (`deleteByUserId`, `removeProductFromAll`).
- **`src/kernel/events.ts`** — `productRemoveFromCartsById` calls `emitDomainEvent` to publish `CART_LINES_REMOVED`; the kernel is what interprets a rejected handler promise as a failure to log.
- **`src/modules/cart/events.ts`** — Source of the `CART_LINES_REMOVED` event constant.
- **`src/modules/cart/module.ts`** — Wires `cartDeleteByUserId` as the `personalData.erase` manifest hook and `productRemoveFromCartsById` as a `subscribe()` domain-event handler.
- **`src/modules/cart/services/index.ts`** — Barrel re-export so other modules import these functions through the service namespace.
- **Integration tests** (`checkout-version`, `merge-effects`, `service`) — Exercise the cleanup paths in the context of full cart workflows.

## Notes

- The two functions are **not** symmetric in failure semantics: `cartDeleteByUserId` must *throw* to abort the caller's transaction; `productRemoveFromCartsById` should *reject* so the event emitter can log and continue. Do not wrap the first in a try/catch.
- `cartDeleteByUserId` is distinct from `cartRemove` (which empties a cart the user still owns). This one deletes the cart document entirely.
- `productRemoveFromCartsById` emits **nothing** when `userIds.length === 0`; downstream listeners can rely on event receipt implying at least one cart was affected.
- The `titles` parameter is a `Record<string, string>` (locale → display name) passed through to the event payload for the `product.deleted` announcement chain.
