import type { Request, Response } from 'express';
import { cartService } from '../services';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import { emitAnalyticsEvent, buildAnalyticsBase } from '@infrastructure/observability/analytics';
import { cartAnalyticsEvents } from '../analytics';

/**
 * GET /cart
 * Get the cart of the current user.
 * Authentication check is done before entering the route.
 */
export const getCart = (request: Request, response: Response) => {
    if (!request.authContext) {
        rejectResponse(response, 401);
        return;
    }
    return cartService
        .cartGetWithSummary(request.authContext.id)
        .then((cart) => {
            emitAnalyticsEvent({
                ...buildAnalyticsBase(request),
                event: cartAnalyticsEvents.CART_VIEWED
            });
            successResponse(response, cart);
        })
        .catch((error: Error) => {
            rejectDatabaseError(response, 'getCart', error);
        });
};
