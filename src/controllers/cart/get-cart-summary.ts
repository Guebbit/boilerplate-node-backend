import type { Request, Response } from 'express';
import { cartService } from '@services/cart';
import { successResponse } from '@utils/response';

/**
 * GET /cart/summary
 * Returns a lightweight summary of the authenticated user's cart.
 */
export const getCartSummary = (request: Request, response: Response) =>
    cartService.cartGetWithSummary(request.user!).then((cart) => {
        successResponse(response, cart.summary);
    });
