import type { Request, Response } from 'express';
import { t } from '@core/i18n';
import { cartService } from '@services/cart';
import { successResponse, rejectResponse } from '@core/http/response';
import { rejectDatabaseError } from '@core/http/errors';
import { cartCheckoutTotal } from '@core/observability/metrics-domain';
import {
    emitAnalyticsEvent,
    analyticsEvents,
    buildAnalyticsBase
} from '@core/observability/analytics';

/**
 * POST /cart/checkout
 * Converts the cart into an order and clears the cart.
 */
export const postCheckout = (request: Request, response: Response) => {
    if (!request.authContext) {
        rejectResponse(response, 401);
        return;
    }
    const userId = request.authContext.id;
    return cartService
        .orderConfirm(userId)
        .then((result) => {
            if (!result.success) {
                cartCheckoutTotal.inc({ status: 'failure' });
                emitAnalyticsEvent({
                    ...buildAnalyticsBase(request),
                    event: analyticsEvents.CHECKOUT_FAILED,
                    properties: { reason: result.errors[0]?.code }
                });
                rejectResponse(response, result.status, result.errors);
                return;
            }
            cartCheckoutTotal.inc({ status: 'success' });
            const orderId = result.data?._id?.toString() ?? '';
            emitAnalyticsEvent({
                ...buildAnalyticsBase(request),
                event: analyticsEvents.CHECKOUT_COMPLETED,
                properties: { order_id: orderId }
            });
            successResponse(
                response,
                { order: result.data, message: t('ecommerce.order-creation-success') },
                201
            );
        })
        .catch((error: Error) => {
            cartCheckoutTotal.inc({ status: 'failure' });
            rejectDatabaseError(response, 'postCheckout', error);
        });
};
