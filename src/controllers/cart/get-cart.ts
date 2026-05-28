import type { Request, Response } from 'express';
import { userService } from '@services/users';
import { successResponse } from '@utils/response';
import { emitAnalyticsEvent, AnalyticsEvent } from '@utils/analytics';
import { getActiveSpanContext } from '@utils/tracer';

/**
 * GET /cart
 * Get the cart of the current user.
 * Authentication check is done before entering the route.
 */
export const getCart = (request: Request, response: Response) =>
    userService.cartGetWithSummary(request.user!).then((cart) => {
        emitAnalyticsEvent({
            distinctId: request.user!.id,
            event: AnalyticsEvent.CART_VIEWED,
            traceId: getActiveSpanContext().traceId
        });
        successResponse(response, cart);
    });
