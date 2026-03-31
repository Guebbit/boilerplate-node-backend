import type { Request, Response } from 'express';
import UserService from '@services/users';
import { successResponse } from '@utils/response';

/**
 * GET /cart/summary
 * Returns a lightweight summary of the authenticated user's cart.
 */
const getCartSummary = (request: Request, response: Response): Promise<void> => {
    const user = request.user!;
    return UserService.cartGetWithSummary(user).then((cart) => {
        successResponse(response, cart.summary);
    });
};

export default getCartSummary;
