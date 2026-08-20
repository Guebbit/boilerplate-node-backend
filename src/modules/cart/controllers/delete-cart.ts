import type { Request, Response } from 'express';
import { cartService } from '../services';
import { successResponse } from '@infrastructure/http/response';
import { emitAnalyticsEvent, buildAnalyticsBase } from '@infrastructure/observability/analytics';
import { cartAnalyticsEvents } from '../analytics';
import { catchAs } from '@infrastructure/http/controller';
import { authContextOf } from '@infrastructure/http/request';

/**
 * DELETE /cart
 * Remove ALL items in the user cart.
 */
export const deleteCart = (request: Request, response: Response) => {
    const userId = authContextOf(request).id;

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
        .catch(catchAs(response, 'deleteCart'));
};
