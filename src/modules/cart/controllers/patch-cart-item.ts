/**
 * @module
 * `PATCH /cart/items/:productId` controller — thin HTTP adapter over `cartService.updateItemQuantity`.
 */

import type { Request, Response } from 'express';
import { UpdateCartItemByIdBody } from '@api/schemas.zod';
import { cartService } from '../services';
import { successResponse } from '@infrastructure/http/response';
import type { CartResponse, UpdateCartItemByIdRequest } from '@types';
import { callerContextOf } from '@infrastructure/http/request';
import { requireId } from '@infrastructure/http/ids';
import { catchAs, parseBody, refused } from '@infrastructure/http/controller';

/**
 * PATCH /cart/items/:productId
 * Set the quantity of a line the cart holds. Returns the updated cart. A change never creates:
 * a line the cart does not hold is 404 `cart.item-not-found`. Shares `POST /cart/items`' 404 for a
 * product the storefront wouldn't show, from the same place: `upsertCartItem`.
 */
export const patchCartItem = (
    request: Request<{ productId?: string }, unknown, UpdateCartItemByIdRequest>,
    response: Response
) => {
    const userId = request.authContext!.id;

    // productId is the path segment; the body carries only the quantity. A malformed one answers
    // as the unknown product the service would have found.
    const productId = requireId(request, response, {
        notFound: 'products.not-found',
        name: 'productId',
        surface: 'path'
    });
    if (!productId) return;

    const body = parseBody(UpdateCartItemByIdBody, request.body, response);
    if (!body) return;

    const { quantity } = body;

    return cartService
        .updateItemQuantity(userId, productId, quantity, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;

            successResponse<CartResponse>(response, result.data);
        })
        .catch(catchAs(response, 'updateCartItemById'));
};
