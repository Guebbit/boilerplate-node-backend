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
         * A product just stopped being reachable — soft-deleted or hard-deleted. Never fires on a
         * restore: what the delete already set in motion (carts and wishlists emptied) stays
         * done, since a restore puts the product back on sale, not undoes
         * the past — see `restoreById`'s own docblock.
         *
         * Emitted and awaited AFTER the write, not before it: this is a past-tense fact, and firing
         * it first would let every listener's cascade (cart and wishlist pulling the line) run
         * even if the write that follows then fails.
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
         * A product's `active` flag flipped from `true` to `false` — never fired for any other
         * edit, including one that repeats `active: false` unchanged (see `products/services/crud.ts`'s
         * `updateById`, the same "flip, not every write" shape `users`' `ADMIN_USER_BANNED` uses).
         * No subscriber, and none is wanted: a deactivated product stays in carts and wishlists
         * (their view reads `availability: unavailable`) and an order already placed treats it as
         * present. Only `product.deleted` pulls lines.
         */
        'product.deactivated': { productId: string };

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

/** See {@link DomainEventMap}'s `'product.deactivated'` for why this exists and what it may trigger. */
export const PRODUCT_DEACTIVATED = 'product.deactivated';
