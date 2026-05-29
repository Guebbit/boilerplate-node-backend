import type { Request, Response } from 'express';
import { cartService } from '@services/cart';
import { successResponse, rejectResponse } from '@utils/response';

/**
 * GET /cart/summary
 * Returns a lightweight summary of the authenticated user's cart.
 */
export const getCartSummary = (request: Request, response: Response) => {
    if (!request.authContext) {
        rejectResponse(response, 401, 'Unauthorized');
        return;
    }
    return cartService.cartGetWithSummary(request.authContext.id).then((cart) => {
        successResponse(response, cart.summary);
    });
};
