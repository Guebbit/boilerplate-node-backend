/**
 * @module
 * `PUT /cart/shipping-method` controller — thin HTTP adapter over
 * `cartService.cartShippingMethodSet`.
 */

import type { Request, Response } from 'express';
import { SetCartShippingMethodBody } from '@api/schemas.zod';
import { cartService } from '../services';
import { successResponse } from '@infrastructure/http/response';
import type { CartResponse, SetCartShippingMethodRequest } from '@types';
import { catchAs, parseBody, refused } from '@infrastructure/http/controller';

/**
 * PUT /cart/shipping-method
 * Sets, or clears (`null`), the shipping method the cart plans to ship by. Returns the updated
 * cart, priced against the choice.
 */
export const putCartShippingMethod = (
    request: Request<unknown, unknown, SetCartShippingMethodRequest>,
    response: Response
) => {
    const userId = request.authContext!.id;

    const body = parseBody(SetCartShippingMethodBody, request.body, response);
    if (!body) return;

    return cartService
        .cartShippingMethodSet(userId, body.shippingMethodId)
        .then((result) => {
            if (refused(response, result)) return;

            successResponse<CartResponse>(response, result.data);
        })
        .catch(catchAs(response, 'setCartShippingMethod'));
};
