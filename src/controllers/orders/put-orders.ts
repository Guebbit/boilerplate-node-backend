import type { Request, Response } from 'express';
import { t } from 'i18next';
import OrderService from '@services/orders';
import { successResponse, rejectResponse } from '@utils/response';
import type { UpdateOrderRequest } from '@types';

/**
 * PUT /orders
 * Update an order by id in the request body (admin).
 */
const putOrders = async (request: Request, response: Response): Promise<void> => {
    const body = request.body as UpdateOrderRequest;
    if (!body.id) {
        rejectResponse(response, 422, 'updateOrder - missing id', [t('generic.error-missing-data')]);
        return;
    }
    const result = await OrderService.update(body.id, { ...body, status: body.status as string | undefined });
    if (!result.success) {
        rejectResponse(response, result.status, result.message, result.errors);
        return;
    }
    successResponse(response, result.data);
};

export default putOrders;
