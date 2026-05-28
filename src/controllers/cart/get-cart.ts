import type { Request, Response } from 'express';
import { cartService } from '@services/cart';
import { successResponse } from '@utils/response';
import { emitAnalyticsEvent, AnalyticsEvent, buildAnalyticsBase } from '@utils/analytics';

/**
 * GET /cart
 * Get the cart of the current user.
 * Authentication check is done before entering the route.
 */
export const getCart = (request: Request, response: Response) =>
    cartService.cartGetWithSummary(request.authContext!.id).then((cart) => {
        emitAnalyticsEvent({
            ...buildAnalyticsBase(request),
            event: AnalyticsEvent.CART_VIEWED
        });
        successResponse(response, cart);
    });
