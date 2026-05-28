import type { Request, Response } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import { t } from 'i18next';
import type { CastError } from 'mongoose';
import { orderService } from '@services/orders';
import { rejectResponse, successResponse } from '@utils/response';
import { extractAndValidateId } from '@utils/helpers-request';
import { emitAuditEvent, AuditAction, buildAuditEvent } from '@utils/audit';

/**
 * DELETE /orders — delete an order by id in the request body (admin).
 * DELETE /orders/:id — delete an order by path id (admin).
 */
export const deleteOrders = (request: Request<ParamsDictionary>, response: Response) => {
    const id = extractAndValidateId(request, response, 'deleteOrder');
    if (!id) return Promise.resolve();

    return orderService
        .removeById(id)
        .then((result) => {
            if (!result.success) {
                rejectResponse(response, result.status, result.message, result.errors);
                return;
            }
            emitAuditEvent(buildAuditEvent(request, {
                action: AuditAction.ADMIN_ORDER_DELETED,
                outcome: 'success',
                target_type: 'order',
                target_id: id
            }));
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
