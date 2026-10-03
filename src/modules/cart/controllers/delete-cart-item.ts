/**
 * @module
 * `DELETE /cart/:productId` and `DELETE /cart` controller — thin HTTP adapter over
 * `cartService.cartItemRemoveById`. One controller for both spellings: `productId` arrives as a
 * path segment on the canonical route, or as a required body field on the alias
 * (`x-alias-of: removeCartItem`). See docs/theory/request-input.md.
 */

import type { Request, Response } from 'express';
import { t } from '@infrastructure/i18n';
import { cartService } from '../services';
import { successResponse } from '@infrastructure/http/response';
import type { CartResponse, RemoveCartItemRequest } from '@types';
import { callerContextOf } from '@infrastructure/http/request';
import { requireId } from '@infrastructure/http/ids';
import { catchAs, refused } from '@infrastructure/http/controller';

/**
 * DELETE /cart/:productId — canonical, path segment.
 * DELETE /cart — alias, `productId` required in the body.
 * Remove a specific product from the cart. Returns the updated cart.
 * Service returns 404 if the item is not in the cart.
 */
export const deleteCartItem = (
    request: Request<{ productId?: string }, unknown, RemoveCartItemRequest>,
    response: Response
) => {
    const userId = request.authContext!.id;
    // `write` reads params before body, no query — neither route declares one. The path segment
    // wins on the canonical route (a malformed one is the bare 404 a line not in the cart gets);
    // the alias has no path segment, so the body is the only source that can ever supply one (a
    // malformed one is a 422 naming `productId`).
    const productId = requireId(request, response, {
        notFound: null,
        name: 'productId',
        surface: 'write'
    });
    if (!productId) return;

    return cartService
        .cartItemRemoveById(userId, productId, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            successResponse<CartResponse>(response, result.data, 200, t('cart.product-removed'));
        })
        .catch(catchAs(response, 'deleteCartItem'));
};
