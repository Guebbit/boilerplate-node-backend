import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import { t } from '@core/i18n';
import { cartService } from '@services/cart';
import { successResponse, rejectResponse } from '@core/http/response';
import { cartCheckoutTotal } from '@core/observability/metrics-domain';
import {
    emitAnalyticsEvent,
    AnalyticsEvent,
    buildAnalyticsBase
} from '@core/observability/analytics';
import { emitDomainEvent } from '@core/observability/events';

/**
 * POST /cart/checkout
 * Converts the cart into an order and clears the cart.
 */
export const postCheckout = (request: Request, response: Response) => {
    if (!request.authContext) {
        rejectResponse(response, 401, 'Unauthorized');
        return;
    }
    const userId = request.authContext.id;
    return cartService.orderConfirm(userId).then((result) => {
        if (!result.success) {
            cartCheckoutTotal.inc({ status: 'failure' });
            emitAnalyticsEvent({
                ...buildAnalyticsBase(request),
                event: AnalyticsEvent.CHECKOUT_FAILED,
                properties: { reason: result.message }
            });
            rejectResponse(response, result.status, result.message, result.errors);
            return;
        }
        cartCheckoutTotal.inc({ status: 'success' });
        const orderId = result.data?._id?.toString() ?? '';
        emitAnalyticsEvent({
            ...buildAnalyticsBase(request),
            event: AnalyticsEvent.CHECKOUT_COMPLETED,
            properties: { order_id: orderId }
        });
        emitDomainEvent('ecommerce.cart.checked_out', {
            eventName: 'ecommerce.cart.checked_out',
            eventId: crypto.randomUUID(),
            occurredAt: new Date().toISOString(),
            cartId: `cart_${userId}`,
            userId,
            orderId,
            itemCount: result.data?.items?.length ?? 0
        });
        successResponse(
            response,
            { order: result.data, message: t('ecommerce.order-creation-success') },
            201
        );
    });
};
