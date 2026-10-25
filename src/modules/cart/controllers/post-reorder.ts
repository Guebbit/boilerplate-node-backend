/**
 * @module
 * `POST /cart/reorder` controller — thin HTTP adapter over `cartService.reorderIntoCart`.
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { cartService } from '../services';
import { catchAs, parseBody, refused } from '@infrastructure/http/controller';
import { callerContextOf } from '@infrastructure/http/request';
import { ReorderBody } from '@api/schemas.zod';
import type { ReorderRequest, ReorderResponse } from '@types';

/**
 * POST /cart/reorder {orderId}
 * Copy one of the caller's own orders back into their cart. The order is only read — this
 * writes to the cart, hence living here. Each line reports what became of it, like the merge: a product that
 * left the catalogue is `removed`, one at the cap is `capped`; an order with nothing left to add answers 409 rather than a hollow 200.
 */
export const postReorder = (
    request: Request<unknown, unknown, ReorderRequest>,
    response: Response
) => {
    // A malformed id is a 422 on `orderId` (a body field), not a 404.
    const body = parseBody(ReorderBody, request.body, response);
    if (!body) return;

    return cartService
        .reorderIntoCart(request.authContext!, body.orderId, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;

            successResponse<ReorderResponse>(response, result.data, 200);
        })
        .catch(catchAs(response, 'postReorder'));
};
