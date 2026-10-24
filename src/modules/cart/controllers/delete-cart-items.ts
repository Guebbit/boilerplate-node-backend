/**
 * @module
 * `DELETE /cart/items` controller — thin HTTP adapter over `cartService.remove`. Bodyless and on
 * the line collection's own URL: the destructive spelling has to be asked for by name, and the
 * 415 guard refuses any body, so nothing stripped in transit can turn a one-line delete into this.
 */

import type { Request, Response } from 'express';
import { cartService } from '../services';
import { successResponse } from '@infrastructure/http/response';
import { catchAs } from '@infrastructure/http/controller';
import { callerContextOf } from '@infrastructure/http/request';
import type { CartResponse } from '@types';

/**
 * DELETE /cart/items
 * Remove ALL items in the user cart.
 */
export const clearCart = (request: Request, response: Response) => {
    const userId = request.authContext!.id;

    return cartService
        .remove(userId, callerContextOf(request))
        .then((cart) => {
            successResponse<CartResponse>(response, cart);
        })
        .catch(catchAs(response, 'clearCart'));
};
