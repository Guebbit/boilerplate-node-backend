import type { Request, Response } from 'express';
import { cartService } from '../services';
import { successResponse } from '@infrastructure/http/response';
import { emitAnalyticsEvent, buildAnalyticsBase } from '@infrastructure/observability/analytics';
import { cartAnalyticsEvents } from '../analytics';
import { catchAs } from '@infrastructure/http/controller';
import { authContextOf } from '@infrastructure/http/request';

/**
 * GET /cart
 * Get the cart of the current user.
 * Authentication check is done before entering the route.
 */
export const getCart = (request: Request, response: Response) => {
    return cartService
        .cartGetWithSummary(authContextOf(request).id)
        .then((cart) => {
            emitAnalyticsEvent({
                ...buildAnalyticsBase(request),
                event: cartAnalyticsEvents.CART_VIEWED
            });
            successResponse(response, cart);
        })
        .catch(catchAs(response, 'getCart'));
};
