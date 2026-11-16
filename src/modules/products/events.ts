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
         * event that pulls cart and wishlist lines: hiding or taking a product off sale emits
         * nothing, and a restore does not undo what the delete set in motion.
         *
         * Outbox:      written in the delete's transaction; redelivered until every listener has
         *              handled it, so a listener is idempotent on `meta.eventId`.
         * `hardDelete`: tells the destructive half from the reversible one; `inventory` deletes
         *              the level row ONLY when `true`, since a restore must find it.
         * `titles`:    the name in every language, read BEFORE a hard delete drops the
         *              translation rows, so a later message (`notifications`) can quote it.
         *
         * @see docs/modules/products.md#hiding-taking-off-sale-removing
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
         * enter only through `POST /inventory/levels/{productId}/receive`, which moves the counter
         * and writes the ledger row together. Never emitted for an UPDATE: counters move only
         * through inventory's ledger writes.
         */
        'product.created': { productId: string };

        /**
         * A product's `releaseDate` moved, was set or was cleared. Goes through the outbox in the
         * same transaction as the edit, so an event exists exactly when the new date does.
         *
         * Why it exists: buyers who already paid were promised the old date. `delivery` listens
         * and decides, per waiting fulfillment order, whether the buyer needs a notice and
         * whether silence now means cancel (docs/modules/products.md#preorder). Both dates are ISO
         * 8601; `from` is absent for a first date, `to` for a cleared one.
         */
        'product.release_date_changed': { productId: string; from?: string; to?: string };

        /**
         * A product's `restockDate` moved, was set or was cleared. The twin of
         * `product.release_date_changed` for the owed units of a released product: buyers who
         * already paid for them were promised the old date, and `delivery` decides per waiting
         * fulfillment order what they are owed. Same shape and the same transaction as the edit.
         */
        'product.restock_date_changed': { productId: string; from?: string; to?: string };

        /**
         * A product that could not be ordered can be again: shelf units arrived, a backorder opened
         * or its date moved on, or it was made visible and buyable. Fires once per flip, never
         * while it stays buyable, in the same transaction as the write that caused it.
         * `stock-alerts` listens and tells the buyers who asked.
         */
        'product.buyable_again': { productId: string };
    }
}

/**
 * The event names, exported through the barrel so an emitter and its listeners share one
 * spelling rather than two string literals that typo independently.
 */
export const PRODUCT_DELETED = 'product.deleted';

/** The event name listeners subscribe to; the payload is in {@link DomainEventMap}. */
export const PRODUCT_CREATED = 'product.created';

/** The event name `delivery` subscribes to for a moved release date. */
export const PRODUCT_RELEASE_DATE_CHANGED = 'product.release_date_changed';

/** The event name stock alerts subscribe to when a product is buyable again. */
export const PRODUCT_BUYABLE_AGAIN = 'product.buyable_again';

/** The event name `delivery` subscribes to for a moved restock date. */
export const PRODUCT_RESTOCK_DATE_CHANGED = 'product.restock_date_changed';
