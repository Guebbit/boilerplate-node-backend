import type { Request, Response } from 'express';
import { t } from 'i18next';
import { orderService } from '@services/orders';
import { successResponse, rejectResponse } from '@utils/response';
import type { DeleteOrderRequest } from '@types';

/**
 * DELETE /orders — delete an order by id in the request body (admin).
 * DELETE /orders/:id — delete an order by path id (admin).
 */
export const deleteOrders = (
    request: Request<{ id?: string }, unknown, DeleteOrderRequest>,
    response: Response
) => {
    const id = request.params.id ?? request.body.id ?? '';

    // missing or not valid
    if (!id || Number.isNaN(Number(id))) {
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
            successResponse(response, undefined, 200, result.message);
        })
        .catch((error: Error) => {
            if (error.message == '404')
                rejectResponse(response, 404, 'deleteOrders - not found', [
                    t('ecommerce.order-not-found')
                ]);
            rejectResponse(response, 500, 'Unknown Error', [error.message]);
        });
};
