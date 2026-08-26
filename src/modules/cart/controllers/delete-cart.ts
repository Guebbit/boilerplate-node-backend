import type { Request, Response } from 'express';
import { cartService } from '../services';
import { successResponse } from '@infrastructure/http/response';
import { catchAs } from '@infrastructure/http/controller';
import { authContextOf, callerContextOf } from '@infrastructure/http/request';

/**
 * DELETE /cart
 * Remove ALL items in the user cart.
 */
export const deleteCart = (request: Request, response: Response) => {
    const userId = authContextOf(request).id;

    return cartService
        .cartRemove(userId, callerContextOf(request))
        .then((cart) => {
            successResponse(response, cart);
        })
        .catch(catchAs(response, 'deleteCart'));
};
