/**
 * @module
 * `POST /cart/reorder/:orderId` controller — thin HTTP adapter over `cartService.reorderIntoCart`.
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { cartService } from '../services';
import { catchAs, refused } from '@infrastructure/http/controller';
import { authContextOf, callerContextOf } from '@infrastructure/http/request';

/**
 * POST /cart/reorder/:orderId
 * Copy one of the caller's own orders back into their cart.
 *
 * Filed under cart because of what it writes: the order is only read. Lines whose product has
 * since left the public catalogue are skipped — the response's cart view is the honest record of
 * what landed — and an order with nothing left to add answers 409 rather than a hollow 200.
 */
export const postReorder = (request: Request<{ orderId: string }>, response: Response) => {
    const userId = authContextOf(request).id;
    const { orderId } = request.params;

    return cartService
        .reorderIntoCart(userId, orderId, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;

            successResponse(response, result.data, 200, result.message);
        })
        .catch(catchAs(response, 'postReorder'));
};
