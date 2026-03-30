import type { Request, Response } from 'express';
import { t } from 'i18next';
import OrderService from '@services/orders';
import { rejectResponse, successResponse } from '@utils/response';
import type { DeleteOrderRequest } from '@api/api';

/**
 * DELETE /orders
 * Delete an order by id in the request body (admin).
 */
const deleteOrder = async (request: Request, response: Response): Promise<void> => {
    const body = request.body as DeleteOrderRequest;
    if (!body.id) {
        rejectResponse(response, 422, 'deleteOrder - missing id', [t('generic.error-missing-data')]);
        return;
    }
    const result = await OrderService.remove(body.id);
    if (!result.success) {
        rejectResponse(response, result.status, result.message, result.errors);
        return;
    }
    successResponse(response, undefined, 200, result.message);
};

export default deleteOrder;
