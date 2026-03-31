import type { Request, Response } from 'express';
import { successResponse } from '@utils/response';
import { buildCartResponse } from './helpers';

/**
 * GET /cart/summary
 * Returns a lightweight summary of the authenticated user's cart.
 */
const getCartSummary = (request: Request, response: Response): Promise<void> => {
    const user = request.user!;
    return buildCartResponse(user).then((cart) => {
        successResponse(response, cart.summary);
    });
};

export default getCartSummary;
