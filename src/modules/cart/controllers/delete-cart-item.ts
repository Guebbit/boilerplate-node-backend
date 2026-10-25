/**
 * @module
 * `DELETE /cart/items/:productId` controller — thin HTTP adapter over
 * `cartService.removeItemById`.
 */

import type { Request, Response } from 'express';
import { cartService } from '../services';
import { successResponse } from '@infrastructure/http/response';
import type { CartResponse } from '@types';
import { callerContextOf } from '@infrastructure/http/request';
import { requireId } from '@infrastructure/http/ids';
import { catchAs, refused } from '@infrastructure/http/controller';

/**
 * DELETE /cart/items/:productId
 * Remove a specific product from the cart. Returns the updated cart.
 * Service returns 404 if the item is not in the cart.
 */
export const deleteCartItem = (request: Request<{ productId?: string }>, response: Response) => {
    const userId = request.authContext!.id;
    // The path segment is the only source; a malformed one answers the same 404 copy as a line
    // not in the cart.
    const productId = requireId(request, response, {
        notFound: 'cart.item-not-found',
        name: 'productId',
        surface: 'path'
    });
    if (!productId) return;

    return cartService
        .removeItemById(userId, productId, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            successResponse<CartResponse>(response, result.data, 200);
        })
        .catch(catchAs(response, 'deleteCartItem'));
};
