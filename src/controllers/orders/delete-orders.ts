import type { Request, Response } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import { t } from 'i18next';
import type { CastError } from 'mongoose';
import { orderService } from '@services/orders';
import { rejectResponse, successResponse } from '@utils/response';
import { extractAndValidateId } from '@utils/helpers-request';
import { emitAuditEvent, extractRequestContext, AuditAction } from '@utils/audit';

/**
 * DELETE /orders — delete an order by id in the request body (admin).
 * DELETE /orders/:id — delete an order by path id (admin).
 */
export const deleteOrders = (request: Request<ParamsDictionary>, response: Response) => {
    const id = extractAndValidateId(request, response, 'deleteOrder');
    if (!id) return Promise.resolve();

    return orderService
        .remove(id)
        .then((result) => {
            if (!result.success) {
                rejectResponse(response, result.status, result.message, result.errors);
                return;
            }
            emitAuditEvent({
                action: AuditAction.ADMIN_ORDER_DELETED,
                actor_user_id: request.authContext?.id ?? 'unknown',
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
                return rejectResponse(response, 404, 'Not Found', [
                    t('ecommerce.order-not-found')
                ]);
            rejectResponse(response, 500, 'Internal Server Error', [error.message]);
        });
};
