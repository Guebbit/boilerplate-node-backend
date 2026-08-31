/**
 * @module
 * Domain events this module emits.
 *
 * Declared by augmenting the kernel's payload map rather than by editing it, so the catalogue of
 * events grows with the modules that own them and no shared file enumerates domains.
 */

/** Registers this module's event payloads into the kernel's app-wide `DomainEventMap`. */
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
 * There is deliberately no stock event. It used to exist (`product.stock_moved`), but that made
 * the ledger row a reaction to a counter change instead of part of it — movers forgot to announce
 * on rollback paths, corrupting the audit trail. The row is now written by the same call that
 * moves the counter, in `@modules/inventory`. `product.deleted` stays an event because a listener
 * genuinely is optional.
 */

/**
 * The event names, exported through the barrel so an emitter and its listeners share one
 * spelling rather than two string literals that typo independently.
 */
export const PRODUCT_DELETED = 'product.deleted';
