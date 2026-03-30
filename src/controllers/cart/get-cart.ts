import type { Request, Response } from 'express';
import { successResponse } from '@utils/response';
import { buildCartResponse } from './helpers';

/**
 * GET /cart
 * Returns all items in the authenticated user's cart along with a summary.
 */
const getCart = async (request: Request, response: Response): Promise<void> => {
    const user = request.user!;
    const cart = await buildCartResponse(user);
    successResponse(response, cart);
};

export default getCart;
