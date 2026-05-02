import type { Request, Response } from 'express';
import { userService } from '@services/users';
import { successResponse } from '@utils/response';

/**
 * GET /cart/summary
 * Returns a lightweight summary of the authenticated user's cart.
 */
export const getCartSummary = (request: Request, response: Response) =>
    userService.cartGetWithSummary(request.user!).then((cart) => {
        successResponse(response, cart.summary);
    });
