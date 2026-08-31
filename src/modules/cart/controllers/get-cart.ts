/**
 * @module
 * `GET /cart` controller — thin HTTP adapter over `cartService.cartGetForView`.
 */

import type { Request, Response } from 'express';
import { cartService } from '../services';
import { successResponse } from '@infrastructure/http/response';
import { catchAs } from '@infrastructure/http/controller';
import { authContextOf, callerContextOf } from '@infrastructure/http/request';

/**
 * GET /cart
 * Get the cart of the current user.
 * Authentication check is done before entering the route.
 */
export const getCart = (request: Request, response: Response) => {
    return cartService
        .cartGetForView(authContextOf(request).id, callerContextOf(request))
        .then((cart) => {
            successResponse(response, cart);
        })
        .catch(catchAs(response, 'getCart'));
};
