/**
 * Domain events this module emits.
 *
 * Declared by augmenting the kernel's payload map rather than by editing it, so the catalogue of
 * events grows with the modules that own them and no shared file enumerates domains.
 */

declare module '@kernel/events' {
    interface DomainEventMap {
        /**
         * A product is about to stop being reachable — soft-deleted, hard-deleted, or restored.
         *
         * Emitted and awaited *before* the write, so listeners that drop references still see a
         * consistent database. Fires on restore as well: the cart lines were already removed when
         * the product was soft-deleted, and re-adding them is the user's call, not the catalogue's.
         */
        'product.deleted': { productId: string };
    }
}

/*
 * There is deliberately no stock event, and there used to be.
 *
 * `product.stock_moved` made the ledger row a REACTION to a counter change rather than half of
 * it, so every mover had to remember to announce on every path — and on the rollback paths they
 * did not. A counter change nobody recorded is a corrupt audit trail, not a smaller feature. The
 * row is now written by the same call that moves the counter, in `@modules/inventory`.
 *
 * `product.deleted` stays an event because a listener genuinely is optional: a shop whose carts
 * never dropped their references still works, just worse.
 */

/**
 * The event names, exported through the barrel so an emitter and its listeners share one
 * spelling rather than two string literals that typo independently.
 */
export const PRODUCT_DELETED = 'product.deleted';
