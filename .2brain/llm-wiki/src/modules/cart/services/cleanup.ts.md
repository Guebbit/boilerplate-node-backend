---
source: src/modules/cart/services/cleanup.ts
source_sha256: 28b260e7699fcd5ac6d7221a83b110d532038897f068f01149eaab14f59e92da
context_sha256: 95c938645e5f0400c62be46f4eb8e2b81c4ec51391a7ae1d6036c09d442ca692
generated_at: 2026-11-22T04:35:38.220275+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/cart/services/cleanup.ts

## Purpose
Cleanup entry points that other modules call when something a cart references but does not own disappears: a user or a product. Neither function is reachable from a cart route. Nothing else tidies up carts after these deletions.

## Key elements
- `cartDeleteByUserId(userId, session)`: deletes a user's whole cart for a hard account deletion, by calling `cartRepository.deleteByUserId`. It serves as the module's `personalData.erase` hook. The `ClientSession` joins the delete to the caller's hard-delete transaction.
- `productRemoveFromCartsById(id, titles)`: removes a product from every user's cart via `cartRepository.removeProductFromAll`. That call returns the affected user IDs. If any were affected, it emits `CART_LINES_REMOVED` with `{ userIds, productId, titles }`. `titles` is the product's names by locale, taken from the `product.deleted` event.

## Relationships
- `src/modules/cart/repository.ts`: `cartRepository` does the actual data work (`deleteByUserId`, `removeProductFromAll`).
- `src/modules/cart/events.ts`: supplies the `CART_LINES_REMOVED` event constant.
- `src/kernel/events.ts`: `emitDomainEvent` publishes the announcement. It treats a rejected handler promise as a failed handler and logs it.
- `src/modules/cart/services/index.ts`: the services barrel, which presumably re-exports these functions (not shown in this file).

## Notes
- The two functions have different failure semantics. `cartDeleteByUserId` is a direct hook, not a domain event, so a throw aborts the caller's transaction. `productRemoveFromCartsById` is an event handler, so a rejected promise is logged and skipped.
- `cartDeleteByUserId` is distinct from `cartRemove`, which empties a cart the user still has.
- No event is emitted when no cart held the product.
- The cart module announces the removal and never imports whoever notifies the owners.
