---
source: src/modules/cart/services/cleanup.ts
sha256: 28b260e7699fcd5ac6d7221a83b110d532038897f068f01149eaab14f59e92da
generated_at: 2026-11-08T05:16:42.518715+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/services/cleanup.ts

## Purpose

Provides the two cleanup entry points the cart module exposes for when entities it references (a user or a product) are hard-deleted elsewhere. Neither function is reachable from a cart route; they are hooks and event handlers wired up in the module manifest so that other modules can trigger cart-side tidying.

## Key elements

- **`cartDeleteByUserId(userId, session)`** — Deletes the user's cart document. Accepts a `ClientSession` so the delete joins the caller's hard-delete transaction. Registered as the `personalData.erase` hook in the cart module manifest.
- **`productRemoveFromCartsById(id, titles)`** — Removes a product from every cart via `cartRepository.removeProductFromAll`, then emits `CART_LINES_REMOVED` (with `userIds`, `productId`, `titles`) if any carts were affected. Registered as a domain-event handler via the module's `subscribe()` method.

## Relationships

- **`src/kernel/events.ts`** — Imports `emitDomainEvent`; this is the sole mechanism by which `productRemoveFromCartsById` announces the removal to listeners. A rejected promise from a downstream handler is what the kernel reads to log a failure.
- **`src/modules/cart/events.ts`** — Imports the `CART_LINES_REMOVED` constant, which is the event name emitted after a product is stripped from carts.
- **`src/modules/cart/repository.ts`** — Imports `cartRepository`; both exports delegate their actual data work (`deleteByUserId`, `removeProductFromAll`) to this repository.
- **`src/modules/cart/services/index.ts`** — Re-exports these two functions so other modules can import them through the services barrel.

## Notes

- The two functions have **different error semantics** by design: `cartDeleteByUserId` runs inside the caller's transaction, so a throw aborts that transaction; `productRemoveFromCartsById` runs as a domain-event handler, where a rejected promise is caught and logged by `emitDomainEvent` rather than propagating.
- `productRemoveFromCartsById` emits **nothing** when no cart contained the product (early return on empty `userIds`), so listeners must not assume the event fires on every product deletion.
- `cartDeleteByUserId` is distinct from the route-level `cartRemove` (which empties a still-existing cart); this one deletes the cart document entirely because the owning user is gone.
