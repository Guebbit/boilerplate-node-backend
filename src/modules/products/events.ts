/**
 * @module
 * Domain events this module emits, declared by augmenting the kernel's payload map rather than
 * editing it, so the catalogue of events grows with the modules that own them and no shared file
 * enumerates domains.
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

        /**
         * A product was created, with the opening stock count the request asked for. The document
         * itself is written with `onHand: 0` — `inventory` (which already imports this module, so
         * an import back here would cycle) is the one and only listener, and moves the counter to
         * `onHand` through its own `receive()`. That is still ONE call moving the counter and
         * writing the ledger row together; the event is only how `products` triggers it without
         * importing `inventory`. Never repeat this for an UPDATE: a past `product.stock_moved`
         * event reacted to a counter a separate write had already changed, so a listener failure
         * left a moved counter with no ledger row explaining it. Here there is nothing to leave
         * inconsistent — a failed listener leaves `onHand` at the honest `0` it started at,
         * recoverable later through `POST /inventory/receipts`, never a silent lie.
         */
        'product.created': { productId: string; onHand: number };
    }
}

/**
 * The event names, exported through the barrel so an emitter and its listeners share one
 * spelling rather than two string literals that typo independently.
 */
export const PRODUCT_DELETED = 'product.deleted';

/** See {@link DomainEventMap}'s `'product.created'` for why this exists and what it may trigger. */
export const PRODUCT_CREATED = 'product.created';
