/**
 * @module
 * Cleanup entry points — what OTHER modules call when something they own disappears.
 *
 * Neither is reachable from a cart route. `cartDeleteByUserId` is the `personalData.erase`
 * hook (`../module.ts`'s manifest), called inside the caller's own hard-delete transaction —
 * never a domain event, so a throw here aborts that transaction rather than being logged and
 * skipped. `productRemoveFromCartsById` stays a domain-event handler (`../module.ts`'s
 * `subscribe()`), where a REJECTED promise is what `emitDomainEvent` (`kernel/events.ts`) reads to
 * decide whether a handler failed and log it. They exist because a cart holds references to two
 * things it does not own, a user and a product, and nothing else tidies up after either.
 */

import type { ClientSession } from 'mongoose';
import { emitDomainEvent } from '@kernel/events';
import { cartRepository } from '../repository';
import { CART_LINES_REMOVED } from '../events';

/**
 * Delete a user's cart outright, for a hard account deletion.
 *
 * Distinct from `cartRemove`, which empties a cart the user still has. Mirrors what
 * {@link productRemoveFromCartsById} does for a deleted product: the cart no longer lives inside
 * the user document, so nothing cleans up after it unless this is called.
 *
 * @param session - joins the delete to the hard-delete transaction calling this hook.
 */
export const cartDeleteByUserId = (userId: string, session: ClientSession): Promise<void> =>
    cartRepository.deleteByUserId(userId, session);

/**
 * Remove a product from all users' carts by product ID, then announce whose carts held it.
 *
 * Announced, not told: this module never imports whoever shows the owners a message. Nothing is
 * emitted when no cart held the product.
 *
 * @param titles - the product's names by locale, carried on to the announcement (see `product.deleted`)
 */
export const productRemoveFromCartsById = (
    id: string,
    titles: Record<string, string>
): Promise<void> =>
    cartRepository.removeProductFromAll(id).then((userIds) => {
        if (userIds.length === 0) return;
        return emitDomainEvent(CART_LINES_REMOVED, { userIds, productId: id, titles }).then(
            () => undefined
        );
    });
