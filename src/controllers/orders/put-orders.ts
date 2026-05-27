import type { Request, Response } from 'express';
import { t } from 'i18next';
import { orderService } from '@services/orders';
import { successResponse, rejectResponse } from '@utils/response';
import type { UpdateOrderByIdRequest } from '@types';
import { emitAuditEvent, extractRequestContext, AuditAction } from '@utils/audit';

/**
 * PUT /orders/:id — update an order by path id (admin).
 */
export const putOrders = (
    request: Request<{ id?: string }, unknown, UpdateOrderByIdRequest>,
    response: Response
) => {
    const id = request.params.id;

    if (!id) {
        rejectResponse(response, 422, 'updateOrder - missing id', [
            t('generic.error-missing-data')
        ]);
        return Promise.resolve();
    }

    return orderService
        .update(id, {
            ...request.body,
            status: request.body.status as string | undefined
        })
        .then((result) => {
            if (!result.success) {
                rejectResponse(response, result.status, result.message, result.errors);
                return;
            }

            emitAuditEvent({
                action: AuditAction.ADMIN_ORDER_UPDATED,
                actor_user_id: request.user?.id ?? 'unknown',
                actor_role: 'admin',
                outcome: 'success',
                target_type: 'order',
                target_id: id,
                ...extractRequestContext(request)
            });

            successResponse(response, result.data);
        })
        .catch((error: Error) => {
            if (error.message === '404')
                rejectResponse(response, 404, 'Not Found', [t('ecommerce.order-not-found')]);
            else rejectResponse(response, 500, 'Internal Server Error', [error.message]);
        });
};
