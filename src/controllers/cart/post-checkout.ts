import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import { t } from 'i18next';
import { cartService } from '@services/cart';
import { successResponse, rejectResponse } from '@utils/response';
import { cartCheckoutTotal } from '@utils/domain-metrics';
import { emitAnalyticsEvent, AnalyticsEvent } from '@utils/analytics';
import { getActiveSpanContext } from '@utils/tracer';
import { emitDomainEvent } from '@utils/domain-events';
import type { CheckoutRequest } from '@types';

/**
 * POST /cart/checkout
 * Converts the cart into an order and clears the cart.
 */
export const postCheckout = (request: Request<unknown, unknown, CheckoutRequest>, response: Response) => {
    const user = request.user!;
    return cartService.orderConfirm(user).then((result) => {
        if (!result.success) {
            cartCheckoutTotal.inc({ status: 'failure' });
            emitAnalyticsEvent({
                distinctId: user.id,
                event: AnalyticsEvent.CHECKOUT_FAILED,
                traceId: getActiveSpanContext().traceId,
                properties: { reason: result.message }
            });
            rejectResponse(response, result.status, result.message, result.errors);
            return;
        }
        cartCheckoutTotal.inc({ status: 'success' });
        const orderId = result.data?._id?.toString() ?? '';
        emitAnalyticsEvent({
            distinctId: user.id,
            event: AnalyticsEvent.CHECKOUT_COMPLETED,
            traceId: getActiveSpanContext().traceId,
            properties: { order_id: orderId }
        });
        // Emit the domain event matching the asyncapi.yaml CartCheckedOutEvent schema.
        emitDomainEvent('ecommerce.cart.checked_out', {
            eventName: 'ecommerce.cart.checked_out',
            eventId: crypto.randomUUID(),
            occurredAt: new Date().toISOString(),
            cartId: `cart_${user.id}`,
            userId: user.id,
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
