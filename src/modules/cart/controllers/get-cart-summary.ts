import type { Request, Response } from 'express';
import { cartService } from '../services';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';

/**
 * GET /cart/summary
 * Returns a lightweight summary of the authenticated user's cart.
 */
export const getCartSummary = (request: Request, response: Response) => {
    if (!request.authContext) {
        rejectResponse(response, 401);
        return;
    }
    return cartService
        .cartGetWithSummary(request.authContext.id)
        .then((cart) => {
            successResponse(response, cart.summary);
        })
        .catch((error: Error) => {
            rejectDatabaseError(response, 'getCartSummary', error);
        });
};
