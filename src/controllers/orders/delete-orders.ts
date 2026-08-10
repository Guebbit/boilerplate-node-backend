import type { Request, Response } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import { t } from '@core/i18n';
import type { CastError } from 'mongoose';
import { orderService } from '@services/orders';
import { rejectResponse, successResponse } from '@core/http/response';
import { rejectDatabaseError } from '@core/http/errors';
import { extractAndValidateId, readInput } from '@core/http/request';
import { hardDeleteSchema } from '@core/http/schemas';
import { emitAuditEvent, AuditAction, buildAuditEvent } from '@core/observability/audit';

/**
 * DELETE /orders — delete an order by id in the request body (admin).
 * DELETE /orders/:id — delete an order by path id (admin).
 * DELETE /orders/:id/hard — the same operation with the flag spelled in the path (admin).
 * Pass ?hardDelete=true to permanently delete; otherwise soft-deletes.
 */
export const deleteOrders = (request: Request<ParamsDictionary>, response: Response) => {
    const id = extractAndValidateId(request, response, 'deleteOrder');
    if (!id) return Promise.resolve();

    // `hardDelete` is a boolean the route accepts three ways — see docs/theory/request-input.md.
    // The path form (`DELETE /orders/:id/hard`) reaches `params` through `routeFlag`.
    const input = readInput(request, {
        sources: ['params', 'query', 'body'],
        booleans: ['hardDelete']
    });
    const parseResult = hardDeleteSchema.safeParse(input.hardDelete);
    if (!parseResult.success)
        return Promise.resolve(
            rejectResponse(
                response,
                422,
                'deleteOrder - invalid hardDelete',
                parseResult.error.issues.map(({ message }) => message)
            )
        );
    const hardDelete = parseResult.data;

    return (
        orderService
            // true = hard-delete; false (default) = soft-delete (sets deletedAt)
            .removeById(id, hardDelete)
            .then((result) => {
                if (!result.success) {
                    rejectResponse(response, result.status, result.message, result.errors);
                    return;
                }
                emitAuditEvent(
                    buildAuditEvent(request, {
                        action: AuditAction.ADMIN_ORDER_DELETED,
                        outcome: 'success',
                        target_type: 'order',
                        target_id: id,
                        metadata: { hardDelete }
                    })
                );
                successResponse(response, undefined, 200, result.message);
            })
            .catch((error: CastError) => {
                if (error.message === '404' || error.kind === 'ObjectId')
                    return rejectResponse(response, 404, 'Not Found', [
                        t('ecommerce.order-not-found')
                    ]);
                rejectDatabaseError(response, 'deleteOrder', error);
            })
    );
};
