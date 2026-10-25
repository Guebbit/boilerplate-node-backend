/**
 * @module
 * `POST /cart/reorder/:orderId` controller — thin HTTP adapter over `cartService.reorderIntoCart`.
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { cartService } from '../services';
import { catchAs, refused } from '@infrastructure/http/controller';
import { callerContextOf } from '@infrastructure/http/request';
import { requireId } from '@infrastructure/http/ids';
import type { ReorderResponse } from '@types';

/**
 * POST /cart/reorder/:orderId
 * Copy one of the caller's own orders back into their cart. The order is only read — this
 * writes to the cart, hence living here. Each line reports what became of it, like the merge: a product that
 * left the catalogue is `removed`, one at the cap is `capped`; an order with nothing left to add answers 409 rather than a hollow 200.
 */
export const postReorder = (request: Request<{ orderId: string }>, response: Response) => {
    const orderId = requireId(request, response, {
        notFound: 'cart.reorder.order-not-found',
        name: 'orderId'
    });
    if (!orderId) return;

    return cartService
        .reorderIntoCart(request.authContext!, orderId, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;

            successResponse<ReorderResponse>(response, result.data, 200);
        })
        .catch(catchAs(response, 'postReorder'));
};
