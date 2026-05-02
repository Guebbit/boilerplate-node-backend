import type { Request, Response } from 'express';
import { userService } from '@services/users';
import { successResponse } from '@utils/response';

/**
 * GET /cart
 * Get the cart of the current user.
 * Authentication check is done before entering the route.
 */
export const getCart = (request: Request, response: Response) =>
    userService.cartGetWithSummary(request.user!).then((cart) => {
        successResponse(response, cart);
    });
