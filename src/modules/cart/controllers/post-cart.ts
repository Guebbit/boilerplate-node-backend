/**
 * @module
 * `POST /cart` controller — thin HTTP adapter over `cartService.cartItemAdd`.
 */

import type { Request, Response } from 'express';
import { t } from '@infrastructure/i18n';
import { AddCartItemBody } from '@api/schemas.zod';
import { cartService } from '../services';
import { createdOrOk } from '@infrastructure/http/response';
import type { CartResponse, AddCartItemRequest } from '@types';
import { callerContextOf } from '@infrastructure/http/request';
import { catchAs, parseBody, refused } from '@infrastructure/http/controller';

/**
 * POST /cart
 * "Add to cart": a product with no line gets one (201); a line already there grows by the quantity
 * (200) — pressing the button twice makes two. `PUT /cart/{productId}` is the door that sets.
 * Eligibility (can this product be in a cart at all) is decided by the service, not here — the
 * same rule must hold for `PUT /cart/{productId}` and the wishlist's move-to-cart.
 */
export const postCart = (
    request: Request<unknown, unknown, AddCartItemRequest>,
    response: Response
) => {
    const userId = request.authContext!.id;

    const body = parseBody(AddCartItemBody, request.body, response);
    if (!body) return;

    // `parseBody` has already refused a `productId` that is not this backend's id (422).
    const { productId, quantity } = body;

    return cartService
        .cartItemAdd(userId, productId, quantity, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;

            // 201 when the product got a line, 200 when the line it already had grew.
            createdOrOk<CartResponse>(
                response,
                result.data,
                result.status,
                `/cart/${productId}`,
                t('cart.product-added')
            );
        })
        .catch(catchAs(response, 'addCartItem'));
};
