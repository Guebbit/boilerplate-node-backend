/**
 * @module
 * `POST /cart/items` controller — thin HTTP adapter over `cartService.addItem`.
 */

import type { Request, Response } from 'express';
import { t } from '@infrastructure/i18n';
import { AddCartItemBody } from '@api/schemas.zod';
import { cartService } from '../services';
import { successResponse } from '@infrastructure/http/response';
import type { CartResponse, AddCartItemRequest } from '@types';
import { callerContextOf } from '@infrastructure/http/request';
import { catchAs, parseBody, refused } from '@infrastructure/http/controller';

/**
 * POST /cart/items
 * "Add to cart": a product with no line gets one; a line already there grows by the quantity —
 * pressing the button twice makes two. Either way the answer is 200 + the whole cart: a line is
 * written through its parent and has no URL of its own. `PATCH /cart/items/{productId}` is the
 * door that sets. Eligibility (can this product be in a cart at all) is decided by the service,
 * not here — the same rule must hold for the PATCH and the wishlist's move-to-cart.
 */
export const postCartItems = (
    request: Request<unknown, unknown, AddCartItemRequest>,
    response: Response
) => {
    const userId = request.authContext!.id;

    const body = parseBody(AddCartItemBody, request.body, response);
    if (!body) return;

    // `parseBody` has already refused a `productId` that is not this backend's id (422).
    const { productId, quantity } = body;

    return cartService
        .addItem(userId, productId, quantity, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;

            successResponse<CartResponse>(response, result.data, 200, t('cart.product-added'));
        })
        .catch(catchAs(response, 'addCartItem'));
};
