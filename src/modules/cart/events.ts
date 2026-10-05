/**
 * @module
 * Domain events the cart emits, declared by augmenting the kernel's payload map rather than
 * editing it, so the catalogue of events grows with the modules that own them.
 */

/** Registers this module's event payloads into the kernel's app-wide `DomainEventMap`. */
declare module '@kernel/events' {
    interface DomainEventMap {
        /**
         * A product left the catalogue and was pulled out of these users' carts. Emitted once per
         * product deletion, after the pull, and only when at least one cart held it.
         *
         * Only the cart knows whose carts held the product, which is why this is the cart's event
         * and not `notifications` listening to `product.deleted` itself.
         *
         * `titles` is the product's name by locale, copied from `product.deleted` — the product is
         * gone, so a listener that wants to name it can only quote this.
         */
        'cart.lines_removed': {
            userIds: string[];
            productId: string;
            titles: Record<string, string>;
        };

        /**
         * `POST /cart/merge` could not add some of a guest cart's lines at all, because the product
         * is no longer publicly visible or none is for sale. One event per merge, with every such
         * line in it, and never emitted for a merge that had none. A line that merely landed with
         * another quantity is not here: that is the answer's to show.
         *
         * `requested` is what the guest asked for. `titles` is the product's name by locale,
         * copied now because the product may be gone by the time anyone reads the message.
         */
        'cart.merge_refused': {
            userId: string;
            lines: {
                productId: string;
                requested: number;
                titles: Record<string, string>;
            }[];
        };
    }
}

/** Event names, exported so an emitter and its listeners share one spelling. */
export const CART_LINES_REMOVED = 'cart.lines_removed';

/** See {@link DomainEventMap}'s `'cart.merge_refused'`. */
export const CART_MERGE_REFUSED = 'cart.merge_refused';
