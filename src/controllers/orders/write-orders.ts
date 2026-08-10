import type { Request, Response } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import { t } from '@core/i18n';
import { CreateOrderBody, UpdateOrderBody, UpdateOrderByIdBody } from '@api/schemas.zod';
import { orderService } from '@services/orders';
import { successResponse, rejectResponse } from '@core/http/response';
import { rejectDatabaseError } from '@core/http/errors';
import { readInput } from '@core/http/request';
import type { CreateOrderRequest, UpdateOrderRequest, UpdateOrderByIdRequest } from '@types';
import { enqueueEmail } from '@core/adapters/mailer';
import { orderCreatedTotal } from '@core/observability/metrics-domain';
import { emitAuditEvent, AuditAction, buildAuditEvent } from '@core/observability/audit';
import {
    emitAnalyticsEvent,
    analyticsEvents,
    buildAnalyticsBase
} from '@core/observability/analytics';

/**
 * POST /orders — create a new order from an explicit payload (admin).
 * PUT /orders — update an order by id in the request body (admin).
 * PUT /orders/:id — update an order by path id (admin).
 *
 * Behaviour: if an id is found (path param or body), the order is updated;
 * otherwise a new order is created (POST only — PUT without id returns 422).
 *
 * Creation bypasses the user cart: items come straight from the request body, which is what
 * makes this an admin operation rather than the checkout path in `@controllers/cart`.
 */
export const writeOrders = (
    request: Request<
        ParamsDictionary,
        unknown,
        CreateOrderRequest | UpdateOrderRequest | UpdateOrderByIdRequest
    >,
    response: Response
) => {
    // One declaration instead of reading `request.params.id` and the body separately — see
    // docs/theory/request-input.md. Orders carry no multipart variant, so nothing needs decoding.
    const { id } = readInput(request, { surface: 'write', ids: ['id'] });

    /**
     * NO ID = new order
     */
    if (!id) {
        // PUT without an id is invalid
        if (request.method === 'PUT') {
            rejectResponse(response, 422, [t('generic.error-missing-data')]);
            return Promise.resolve();
        }

        const parseResult = CreateOrderBody.safeParse(request.body);
        if (!parseResult.success) {
            rejectResponse(
                response,
                422,
                parseResult.error.issues.map(({ message }) => message)
            );
            return Promise.resolve();
        }

        const { userId, email, items } = parseResult.data;

        return orderService.create(userId, email, items).then((result) => {
            if (!result.success) {
                rejectResponse(response, result.status, result.errors);
                return;
            }

            void enqueueEmail(
                {
                    to: email,
                    subject: t('email.order-confirm.subject')
                },
                'email-order-confirm.ejs',
                {
                    ...response.locals,
                    pageMetaTitle: t('email.order-confirm.meta-title'),
                    pageMetaLinks: [],
                    // Admin-created orders only have email; username is not in the payload.
                    name: email
                }
            );

            orderCreatedTotal.inc();
            const orderId = result.data?._id?.toString() ?? '';
            emitAuditEvent(
                buildAuditEvent(request, {
                    action: AuditAction.ADMIN_ORDER_CREATED,
                    outcome: 'success',
                    target_type: 'order',
                    target_id: orderId
                })
            );
            emitAnalyticsEvent({
                ...buildAnalyticsBase(request),
                event: analyticsEvents.ORDER_CREATED,
                properties: { order_id: orderId }
            });
            successResponse(response, result.data, 201);
        });
    }

    /**
     * ID = edit order
     */
    // UpdateOrderBody requires `id` in the body; UpdateOrderByIdBody takes it from the path instead.
    const schema = request.params.id ? UpdateOrderByIdBody : UpdateOrderBody;
    const parseResult = schema.safeParse(request.body);
    if (!parseResult.success) {
        rejectResponse(
            response,
            422,
            parseResult.error.issues.map(({ message }) => message)
        );
        return Promise.resolve();
    }

    return orderService
        .updateById(id, parseResult.data)
        .then((result) => {
            if (!result.success) {
                rejectResponse(response, result.status, result.errors);
                return;
            }

            emitAuditEvent(
                buildAuditEvent(request, {
                    action: AuditAction.ADMIN_ORDER_UPDATED,
                    outcome: 'success',
                    target_type: 'order',
                    target_id: id
                })
            );

            successResponse(response, result.data);
        })
        .catch((error: Error) => {
            rejectDatabaseError(response, 'writeOrder', error);
        });
};
