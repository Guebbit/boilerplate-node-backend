import type { Request, Response } from 'express';
import { successResponse } from '@utils/response';
import { buildCartResponse } from './helpers';

/**
 * GET /cart/summary
 * Returns a lightweight summary of the authenticated user's cart.
 */
const getCartSummary = async (request: Request, response: Response): Promise<void> => {
    const user = request.user!;
    const cart = await buildCartResponse(user);
    successResponse(response, cart.summary);
};

export default getCartSummary;
