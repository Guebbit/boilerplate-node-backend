import type { Request, Response } from 'express';
import { t } from 'i18next';
import OrderService from '@services/orders';
import { successResponse, rejectResponse } from '@utils/response';
import type { CreateOrderRequest } from '../../../api/api';

/**
 * POST /orders
 * Create a new order from a payload (admin).
 */
const postOrders = async (request: Request, response: Response): Promise<void> => {
    const body = request.body as CreateOrderRequest;

    /**
     * Data validation
     */
    if (!body.userId || !body.email || !body.items?.length) {
        rejectResponse(response, 422, 'createOrder - invalid data', [t('generic.error-missing-data')]);
        return;
    }

    /**
     * Create a new order
     */
    const result = await OrderService.create(body.userId, body.email, body.items);
    if (!result.success) {
        rejectResponse(response, result.status, result.message, result.errors);
        return;
    }
    successResponse(response, result.data, 201);
};

export default postOrders;
