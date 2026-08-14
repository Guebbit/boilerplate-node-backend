import type { Request, Response } from 'express';
import { t } from '@infrastructure/i18n';
import { cartService } from '../services';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import { cartCheckoutTotal } from '../metrics';
import {
    emitAnalyticsEvent,
    analyticsEvents,
    buildAnalyticsBase
} from '@infrastructure/observability/analytics';

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
    // `?? {}` because a checkout without a body is legal and Express 5 leaves `body` undefined.
    const { addressId, shippingMethodId } = (request.body ?? {}) as {
        addressId?: string;
        shippingMethodId?: string;
    };
    return cartService
        .orderConfirm(userId, addressId, shippingMethodId)
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
                { order: result.data, message: t('orders.creation-success') },
                201
            );
        })
        .catch((error: Error) => {
            cartCheckoutTotal.inc({ status: 'failure' });
            rejectDatabaseError(response, 'postCheckout', error);
        });
};
