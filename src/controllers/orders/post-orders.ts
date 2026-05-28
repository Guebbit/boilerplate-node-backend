import type { Request, Response } from 'express';
import { t } from 'i18next';
import { orderService } from '@services/orders';
import { successResponse, rejectResponse } from '@utils/response';
import type { CreateOrderRequest } from '@types';
import { enqueueEmail } from '@utils/nodemailer';
import { orderCreatedTotal } from '@utils/domain-metrics';
import { emitAuditEvent, extractRequestContext, AuditAction } from '@utils/audit';
import { emitAnalyticsEvent, AnalyticsEvent } from '@utils/analytics';
import { getActiveSpanContext } from '@utils/tracer';

/**
 * POST /orders
 * Create a new order from an explicit payload (admin).
 * Bypasses the user cart — items are taken directly from the request body.
 */
export const postOrders = (
    request: Request<unknown, unknown, CreateOrderRequest>,
    response: Response
) => {
    /*
     * Data validation
     */
    if (!request.body.userId || !request.body.email || !request.body.items?.length) {
        rejectResponse(response, 422, 'createOrder - invalid data', [
            t('generic.error-missing-data')
        ]);
        return Promise.resolve();
    }

    const { userId, email, items } = request.body;

    /*
     * Create the order directly from the request body.
     */
    return orderService.create(userId, email, items).then((result) => {
        if (!result.success) {
            rejectResponse(response, result.status, result.message, result.errors);
            return;
        }

        void enqueueEmail(
            {
                to: email,
                subject: 'Order confirmed'
            },
            'email-order-confirm.ejs',
            {
                ...response.locals,
                pageMetaTitle: 'Order confirmed',
                pageMetaLinks: [],
                name: email
            }
        );

        orderCreatedTotal.inc();
        const orderId = result.data?._id?.toString() ?? '';
        emitAuditEvent({
            action: AuditAction.ADMIN_ORDER_CREATED,
            actor_user_id: request.user?.id ?? 'unknown',
            actor_role: request.user?.admin ? 'admin' : 'user',
            outcome: 'success',
            target_type: 'order',
            target_id: orderId,
            ...extractRequestContext(request)
        });
        emitAnalyticsEvent({
            distinctId: request.user?.id ?? 'unknown',
            event: AnalyticsEvent.ORDER_CREATED,
            traceId: getActiveSpanContext().traceId,
            properties: { order_id: orderId }
        });
        successResponse(response, result.data, 201);
    });
};
