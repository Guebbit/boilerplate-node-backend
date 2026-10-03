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
import { cartRepository } from '../repository';

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

/** Remove a product from all users' carts by product ID. */
export const productRemoveFromCartsById = (id: string): Promise<void> =>
    cartRepository.removeProductFromAll(id).then(() => undefined);
