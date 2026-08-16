import type { Request, Response } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import { getDefaultLocale, t } from '@infrastructure/i18n';
import { CreateOrderBody, UpdateOrderBody, UpdateOrderByIdBody } from '@api/schemas.zod';
import { orderService } from '../service';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import { readInput } from '@infrastructure/http/request';
import type { CreateOrderRequest, UpdateOrderRequest, UpdateOrderByIdRequest } from '@types';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { orderConfirmEmail } from '../emails';
import { orderCreatedTotal } from '../metrics';
import { emitAuditEvent, buildAuditEvent } from '@infrastructure/observability/audit';
import { ordersAuditActions } from '../audit';
import { emitAnalyticsEvent, buildAnalyticsBase } from '@infrastructure/observability/analytics';
import { ordersAnalyticsEvents } from '../analytics';

/**
 * POST /orders — create a new order from an explicit payload (admin).
 * PUT /orders — update an order by id in the request body (admin).
 * PUT /orders/:id — update an order by path id (admin).
 *
 * Behaviour: if an id is found (path param or body), the order is updated;
 * otherwise a new order is created (POST only — PUT without id returns 422).
 *
 * Creation bypasses the user cart: items come straight from the request body, which is what
 * makes this an admin operation rather than the checkout path in `@modules/cart`.
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

        return orderService
            .create(userId, email, items)
            .then((result) => {
                if (!result.success) {
                    rejectResponse(response, result.status, result.errors);
                    return;
                }

                // The request's own language: an admin-created order has no recipient record to take
                // one from. Admin-created orders only have an email, so it stands in for the name.
                if (result.data) {
                    const mail = orderConfirmEmail(
                        request.locale ?? getDefaultLocale(),
                        email,
                        result.data
                    );
                    void enqueueEmail(
                        { to: email, subject: mail.subject },
                        mail.template,
                        mail.data
                    );
                }

                orderCreatedTotal.inc();
                const orderId = result.data?._id?.toString() ?? '';
                emitAuditEvent(
                    buildAuditEvent(request, {
                        action: ordersAuditActions.ADMIN_ORDER_CREATED,
                        outcome: 'success',
                        target_type: 'order',
                        target_id: orderId
                    })
                );
                emitAnalyticsEvent({
                    ...buildAnalyticsBase(request),
                    event: ordersAnalyticsEvents.ORDER_CREATED,
                    properties: { order_id: orderId }
                });
                successResponse(response, result.data, 201);
            })
            .catch((error: Error) => rejectDatabaseError(response, 'createOrder', error));
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
                    action: ordersAuditActions.ADMIN_ORDER_UPDATED,
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
