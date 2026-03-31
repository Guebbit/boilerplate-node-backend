import type { Request, Response } from 'express';
import UserService from '@services/users';
import { successResponse } from '@utils/response';

/**
 * GET /cart
 * Get the cart of the current user.
 * Authentication check is done before entering the route.
 */
const getCart = (request: Request, response: Response): Promise<void> => {
    const user = request.user!;
    return UserService.cartGetWithSummary(user).then((cart) => {
        successResponse(response, cart);
    });
};

export default getCart;
