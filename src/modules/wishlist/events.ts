/**
 * @module
 * Domain events the wishlist emits, declared by augmenting the kernel's payload map rather than
 * editing it, so the catalogue of events grows with the modules that own them.
 */

/** Registers this module's event payloads into the kernel's app-wide `DomainEventMap`. */
declare module '@kernel/events' {
    interface DomainEventMap {
        /**
         * A product left the catalogue and was pulled out of these users' wishlists. Emitted once
         * per product deletion, after the pull, and only when at least one wishlist held it.
         *
         * `titles` is the product's name by locale, copied from `product.deleted` — the product is
         * gone, so a listener that wants to name it can only quote this.
         */
        'wishlist.items_removed': {
            userIds: string[];
            productId: string;
            titles: Record<string, string>;
        };
    }
}

/** The event name, exported so an emitter and its listeners share one spelling. */
export const WISHLIST_ITEMS_REMOVED = 'wishlist.items_removed';
