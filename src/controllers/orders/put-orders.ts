import type { Request, Response } from 'express';
import { t } from 'i18next';
import { orderService } from '@services/orders';
import { successResponse, rejectResponse } from '@utils/response';
import type { UpdateOrderRequest, UpdateOrderByIdRequest } from '@types';

/**
 * PUT /orders — update an order by id in the request body (admin).
 * PUT /orders/:id — update an order by path id (admin).
 */
export const putOrders = (
    request: Request<{ id?: string }, unknown, UpdateOrderRequest | UpdateOrderByIdRequest>,
    response: Response
) => {
    const id = request.params.id ?? (request.body as UpdateOrderRequest).id;

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

            successResponse(response, result.data);
        })
        .catch((error: Error) => {
            if (error.message === '404')
                rejectResponse(response, 404, 'Not Found', [t('ecommerce.order-not-found')]);
            else rejectResponse(response, 500, 'Internal Server Error', [error.message]);
        });
};
