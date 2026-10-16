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
         * A product just stopped being reachable — soft-deleted or hard-deleted. The ONLY catalogue
         * event that pulls cart and wishlist lines: hiding a product (`active: false`) or taking it
         * off sale (`purchasable: false`) emits nothing, and no placed order is ever cancelled by a
         * catalogue change. Never fires on a restore: what the delete already set in motion (carts and wishlists emptied) stays
         * done, since a restore puts the product back on sale, not undoes
         * the past — see `restoreById`'s own docblock.
         *
         * Goes through the transactional outbox (`aggregateId` = the product), written in the same
         * transaction as the delete: a past-tense fact exists exactly when the write committed, and
         * the relay redelivers it until every listener has handled it, so a listener must be
         * idempotent on `meta.eventId`.
         *
         * `hardDelete` is what lets a listener tell the destructive half apart from the reversible
         * one — `inventory` deletes this product's level row ONLY when it is `true`: a soft delete
         * must leave the counters exactly where they are, since the row is what a restore has to
         * come back to.
         *
         * `titles` is the product's name in every language it had, read BEFORE a hard delete drops
         * the translation rows: once the event fires the product is gone, and a message that
         * outlives it (`notifications`) can only quote what travelled with it. Locale → title.
         */
        'product.deleted': {
            productId: string;
            hardDelete: boolean;
            titles: Record<string, string>;
        };

        /**
         * A product was created. The document is written with `onHand: 0`, and `inventory` (which
         * already imports this module, so an import back here would cycle) is the one and only
         * listener: it opens the product's stock level at zero. Stock never rides this event: units
         * enter only through `POST /inventory/receipts`, which moves the counter and writes the
         * ledger row together. Never repeat this for an UPDATE: a past `product.stock_moved`
         * event reacted to a counter a separate write had already changed, so a listener failure
         * left a moved counter with no ledger row explaining it.
         */
        'product.created': { productId: string };

        /**
         * A product's `releaseDate` moved, was set or was cleared. Goes through the outbox in the
         * same transaction as the edit, so an event exists exactly when the new date does.
         *
         * Why it exists: buyers who already paid were promised the old date. `delivery` listens
         * and decides, per waiting fulfillment order, whether the buyer needs a notice and
         * whether silence now means cancel (PRODUCT_STATES P5). Both dates are ISO 8601; `from`
         * is absent for a first date, `to` for a cleared one.
         */
        'product.release_date_changed': { productId: string; from?: string; to?: string };
    }
}

/**
 * The event names, exported through the barrel so an emitter and its listeners share one
 * spelling rather than two string literals that typo independently.
 */
export const PRODUCT_DELETED = 'product.deleted';

/** See {@link DomainEventMap}'s `'product.created'` for why this exists and what it may trigger. */
export const PRODUCT_CREATED = 'product.created';

/** See {@link DomainEventMap}'s `'product.release_date_changed'` for what listens and why. */
export const PRODUCT_RELEASE_DATE_CHANGED = 'product.release_date_changed';
