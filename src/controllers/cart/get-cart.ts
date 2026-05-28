import type { Request, Response } from 'express';
import { cartService } from '@services/cart';
import { successResponse } from '@utils/response';
import { emitAnalyticsEvent, AnalyticsEvent } from '@utils/analytics';
import { getActiveSpanContext } from '@utils/tracer';

/**
 * GET /cart
 * Get the cart of the current user.
 * Authentication check is done before entering the route.
 */
export const getCart = (request: Request, response: Response) =>
    cartService.cartGetWithSummary(request.authContext!.id).then((cart) => {
        emitAnalyticsEvent({
            distinctId: request.authContext!.id,
            event: AnalyticsEvent.CART_VIEWED,
            traceId: getActiveSpanContext().traceId
        });
        successResponse(response, cart);
    });
