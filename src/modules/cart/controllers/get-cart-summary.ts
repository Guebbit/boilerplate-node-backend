import type { Request, Response } from 'express';
import { cartService } from '../services';
import { successResponse } from '@infrastructure/http/response';
import { catchAs } from '@infrastructure/http/controller';
import { authContextOf } from '@infrastructure/http/request';

/**
 * GET /cart/summary
 * Returns a lightweight summary of the authenticated user's cart.
 */
export const getCartSummary = (request: Request, response: Response) => {
    return cartService
        .cartGetWithSummary(authContextOf(request).id)
        .then((cart) => {
            successResponse(response, cart.summary);
        })
        .catch(catchAs(response, 'getCartSummary'));
};
