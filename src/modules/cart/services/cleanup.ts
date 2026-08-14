/**
 * Cleanup entry points — what OTHER modules call when something they own disappears.
 *
 * Neither is reachable from a cart route. They exist because a cart holds references to two things
 * it does not own, a user and a product, and nothing else tidies up after either. `../module.ts`
 * wires both to the domain events that fire on deletion.
 */

import type { CastError } from 'mongoose';
import {
    generateSuccess,
    type ResponseSuccess,
    type ResponseReject
} from '@infrastructure/http/response';
import { rejectDatabaseEnvelope } from '@infrastructure/http/errors';
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

/**
 * Remove a product from all users' carts by product ID.
 */
export const productRemoveFromCartsById = (
    id: string
): Promise<ResponseSuccess<undefined> | ResponseReject> =>
    cartRepository
        .removeProductFromAll(id)
        .then((result) =>
            generateSuccess(
                undefined,
                200,
                `Product ${id} removed from ${result.modifiedCount} cart(s)`
            )
        )
        .catch((error: CastError | Error) => rejectDatabaseEnvelope('cart', error));
