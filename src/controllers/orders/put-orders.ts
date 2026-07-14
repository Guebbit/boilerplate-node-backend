import type { Request, Response } from 'express';
import { t } from 'i18next';
import { UpdateOrderBody, UpdateOrderByIdBody } from '@api/schemas.zod';
import { orderService } from '@services/orders';
import { successResponse, rejectResponse } from '@utils/response';
import type { UpdateOrderRequest, UpdateOrderByIdRequest } from '@types';
import { emitAuditEvent, AuditAction, buildAuditEvent } from '@utils/audit';

/**
 * PUT /orders — update an order by id in the request body (admin).
 * PUT /orders/:id — update an order by path id (admin).
 */
export const putOrders = (
    request: Request<{ id?: string }, unknown, UpdateOrderRequest | UpdateOrderByIdRequest>,
    response: Response
) => {
    // UpdateOrderBody requires `id` in the body; UpdateOrderByIdBody takes it from the path instead.
    const schema = request.params.id ? UpdateOrderByIdBody : UpdateOrderBody;
    const parseResult = schema.safeParse(request.body);
    if (!parseResult.success) {
        rejectResponse(
            response,
            422,
            'updateOrder - invalid data',
            parseResult.error.issues.map(({ message }) => message)
        );
        return Promise.resolve();
    }

    const id = request.params.id ?? (parseResult.data as UpdateOrderRequest).id;
    if (!id) {
        rejectResponse(response, 422, 'updateOrder - missing id', [
            t('generic.error-missing-data')
        ]);
        return Promise.resolve();
    }

    return orderService
        .updateById(id, parseResult.data)
        .then((result) => {
            if (!result.success) {
                rejectResponse(response, result.status, result.message, result.errors);
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
            if (error.message === '404')
                rejectResponse(response, 404, 'updateOrder - not found', [
                    t('ecommerce.order-not-found')
                ]);
            else rejectResponse(response, 500, 'updateOrder', [error.message]);
        });
};
