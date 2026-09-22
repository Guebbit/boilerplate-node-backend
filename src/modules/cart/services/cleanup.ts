/**
 * @module
 * Cleanup entry points — what OTHER modules call when something they own disappears.
 *
 * Neither is reachable from a cart route: both are only ever domain-event handlers (`../module.ts`
 * wires them to the events that fire on deletion), so a REJECTED promise, not an HTTP envelope, is
 * the correct shape here — that is what `emitDomainEvent` (`kernel/events.ts`) reads to decide
 * whether a handler failed and log it. They exist because a cart holds references to two things it
 * does not own, a user and a product, and nothing else tidies up after either.
 */

import { cartRepository } from '../repository';

/**
 * Delete a user's cart outright, for a hard account deletion.
 *
 * Distinct from `cartRemove`, which empties a cart the user still has. Mirrors what
 * {@link productRemoveFromCartsById} does for a deleted product: the cart no longer lives inside
 * the user document, so nothing cleans up after it unless this is called.
 */
export const cartDeleteByUserId = (userId: string): Promise<void> =>
    cartRepository.deleteByUserId(userId);

/** Remove a product from all users' carts by product ID. */
export const productRemoveFromCartsById = (id: string): Promise<void> =>
    cartRepository.removeProductFromAll(id).then(() => undefined);
