/**
 * @module
 * `DELETE /cart/all` controller — thin HTTP adapter over `cartService.cartRemove`. Bodyless and
 * on its own URL: `DELETE /cart` used to fall back to clearing everything when its body was
 * absent, which meant a body stripped in transit destroyed the whole cart instead of failing.
 * The destructive spelling now has to be asked for by name.
 */

import type { Request, Response } from 'express';
import { cartService } from '../services';
import { successResponse } from '@infrastructure/http/response';
import { catchAs } from '@infrastructure/http/controller';
import { authContextOf, callerContextOf } from '@infrastructure/http/request';

/**
 * DELETE /cart/all
 * Remove ALL items in the user cart.
 */
export const clearCart = (request: Request, response: Response) => {
    const userId = authContextOf(request).id;

    return cartService
        .cartRemove(userId, callerContextOf(request))
        .then((cart) => {
            successResponse(response, cart);
        })
        .catch(catchAs(response, 'clearCart'));
};
