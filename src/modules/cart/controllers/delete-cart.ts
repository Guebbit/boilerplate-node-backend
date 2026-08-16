import type { Request, Response } from 'express';
import { cartService } from '../services';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import { emitAnalyticsEvent, buildAnalyticsBase } from '@infrastructure/observability/analytics';
import { cartAnalyticsEvents } from '../analytics';

/**
 * DELETE /cart
 * Remove ALL items in the user cart.
 */
export const deleteCart = (request: Request, response: Response) => {
    if (!request.authContext) {
        rejectResponse(response, 401);
        return;
    }
    const userId = request.authContext.id;

    return cartService
        .cartRemove(userId)
        .then((cart) => {
            emitAnalyticsEvent({
                ...buildAnalyticsBase(request),
                event: cartAnalyticsEvents.CART_CLEARED,
                properties: {}
            });
            successResponse(response, cart);
        })
        .catch((error: Error) => {
            rejectDatabaseError(response, 'deleteCart', error);
        });
};
