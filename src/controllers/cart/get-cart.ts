import type { Request, Response } from 'express';
import { successResponse } from '@utils/response';
import { buildCartResponse } from './helpers';

/**
 * GET /cart
 * Get the cart of the current user.
 * Authentication check is done before entering the route.
 */
const getCart = async (request: Request, response: Response): Promise<void> => {
    const user = request.user!;
    const cart = await buildCartResponse(user);
    successResponse(response, cart);
};

export default getCart;
