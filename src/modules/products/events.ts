/**
 * Domain events this module emits.
 *
 * Declared by augmenting the kernel's payload map rather than by editing it, so the catalogue of
 * events grows with the modules that own them and no shared file enumerates domains.
 */

declare module '@kernel/events' {
    interface IDomainEventMap {
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

/**
 * The event name, exported through the barrel so an emitter and its listeners share one spelling
 * rather than two string literals that typo independently.
 */
export const PRODUCT_DELETED = 'product.deleted';
