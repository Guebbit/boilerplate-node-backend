import type { Request, Response } from 'express';
import { t } from 'i18next';
import { userService } from '@services/users';
import { successResponse, rejectResponse } from '@utils/response';
import { cartCheckoutTotal } from '@utils/domain-metrics';
import { emitAnalyticsEvent, AnalyticsEvent } from '@utils/analytics';

/**
 * POST /cart/checkout
 * Converts the cart into an order and clears the cart.
 */
export const postCheckout = (request: Request, response: Response) => {
    const user = request.user!;
    return userService.orderConfirm(user).then((result) => {
        if (!result.success) {
            cartCheckoutTotal.inc({ status: 'failure' });
            emitAnalyticsEvent({
                distinctId: user.id,
                event: AnalyticsEvent.CHECKOUT_FAILED,
                traceId: request.traceContext?.traceId,
                properties: { reason: result.message },
            });
            rejectResponse(response, result.status, result.message, result.errors);
            return;
        }
        cartCheckoutTotal.inc({ status: 'success' });
        const orderId = String((result.data as { _id?: unknown })?._id ?? '');
        emitAnalyticsEvent({
            distinctId: user.id,
            event: AnalyticsEvent.CHECKOUT_COMPLETED,
            traceId: request.traceContext?.traceId,
            properties: { order_id: orderId },
        });
        successResponse(
            response,
            { order: result.data, message: t('ecommerce.order-creation-success') },
            201
        );
    });
};
