/**
 * @module
 * `POST /cart/reorder/:orderId` controller — thin HTTP adapter over `cartService.reorderIntoCart`.
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { cartService } from '../services';
import { catchAs, refused } from '@infrastructure/http/controller';
import { authContextOf, callerContextOf } from '@infrastructure/http/request';
import type { CartResponse } from '@types';

/**
 * POST /cart/reorder/:orderId
 * Copy one of the caller's own orders back into their cart. The order is only read — this
 * writes to the cart, hence living here. Lines whose product left the catalogue are skipped;
 * an order with nothing left to add answers 409 rather than a hollow 200.
 */
export const postReorder = (request: Request<{ orderId: string }>, response: Response) => {
    const userId = authContextOf(request).id;
    const { orderId } = request.params;

    return cartService
        .reorderIntoCart(userId, orderId, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;

            // `refused` narrows on `success` but not `result`'s type; `data` is always set here.
            successResponse<CartResponse>(response, result.data!, 200, result.message);
        })
        .catch(catchAs(response, 'postReorder'));
};
