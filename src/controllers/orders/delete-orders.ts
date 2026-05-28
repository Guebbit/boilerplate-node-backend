import type { Request, Response } from 'express';
import { t } from 'i18next';
import { orderService } from '@services/orders';
import { successResponse, rejectResponse } from '@utils/response';
import type { DeleteOrderRequest } from '@types';
import { type CastError, Types } from 'mongoose';
import { emitAuditEvent, extractRequestContext, AuditAction } from '@utils/audit';

/**
 * DELETE /orders — delete an order by id in the request body (admin).
 * DELETE /orders/:id — delete an order by path id (admin).
 */
export const deleteOrders = (
    request: Request<{ id?: string }, unknown, DeleteOrderRequest>,
    response: Response
) => {
    const id = request.params.id ?? request.body.id;

    // missing or not valid
    if (!id || !Types.ObjectId.isValid(id)) {
        rejectResponse(response, 422, 'deleteOrder - missing id', [
            t('generic.error-missing-data')
        ]);
        return Promise.resolve();
    }

    return orderService
        .remove(id)
        .then((result) => {
            if (!result.success) {
                rejectResponse(response, result.status, result.message, result.errors);
                return;
            }
            emitAuditEvent({
                action: AuditAction.ADMIN_ORDER_DELETED,
                actor_user_id: request.user?.id ?? 'unknown',
                actor_role: 'admin',
                outcome: 'success',
                target_type: 'order',
                target_id: id,
                ...extractRequestContext(request)
            });
            successResponse(response, undefined, 200, result.message);
        })
        .catch((error: CastError) => {
            if (error.message === '404' || error.kind === 'ObjectId')
                return rejectResponse(response, 404, 'deleteOrders - not found', [
                    t('ecommerce.order-not-found')
                ]);
            rejectResponse(response, 500, 'Unknown Error', [error.message]);
        });
};
