import type { Request, Response } from 'express';
import { cartService } from '@services/cart';
import { successResponse, rejectResponse } from '@core/http/response';
import {
    emitAnalyticsEvent,
    AnalyticsEvent,
    buildAnalyticsBase
} from '@core/observability/analytics';

/**
 * DELETE /cart
 * Remove ALL items in the user cart.
 */
export const deleteCart = (request: Request, response: Response) => {
    if (!request.authContext) {
        rejectResponse(response, 401, 'Unauthorized');
        return;
    }
    const userId = request.authContext.id;

    return cartService.cartRemove(userId).then((cart) => {
        emitAnalyticsEvent({
            ...buildAnalyticsBase(request),
            event: AnalyticsEvent.CART_CLEARED,
            properties: {}
        });
        successResponse(response, cart);
    });
};
