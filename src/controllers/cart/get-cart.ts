import type { Request, Response } from 'express';
import { cartService } from '@services/cart';
import { successResponse, rejectResponse } from '@core/http/response';
import { rejectDatabaseError } from '@core/http/errors';
import {
    emitAnalyticsEvent,
    analyticsEvents,
    buildAnalyticsBase
} from '@core/observability/analytics';

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
                event: analyticsEvents.CART_VIEWED
            });
            successResponse(response, cart);
        })
        .catch((error: Error) => {
            rejectDatabaseError(response, 'getCart', error);
        });
};
