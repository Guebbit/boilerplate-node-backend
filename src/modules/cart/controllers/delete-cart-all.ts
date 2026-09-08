/**
 * @module
 * `DELETE /cart/all` controller — thin HTTP adapter over `cartService.cartRemove`. Bodyless and on
 * its own URL so the destructive spelling has to be asked for by name: were it `DELETE /cart`
 * falling back to "clear everything" on an absent body, a body stripped in transit would destroy
 * the whole cart instead of failing.
 */

import type { Request, Response } from 'express';
import { cartService } from '../services';
import { successResponse } from '@infrastructure/http/response';
import { catchAs } from '@infrastructure/http/controller';
import { callerContextOf } from '@infrastructure/http/request';
import type { CartResponse } from '@types';

/**
 * DELETE /cart/all
 * Remove ALL items in the user cart.
 */
export const clearCart = (request: Request, response: Response) => {
    const userId = request.authContext!.id;

    return cartService
        .cartRemove(userId, callerContextOf(request))
        .then((cart) => {
            successResponse<CartResponse>(response, cart);
        })
        .catch(catchAs(response, 'clearCart'));
};
