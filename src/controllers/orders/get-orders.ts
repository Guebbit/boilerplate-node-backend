import type { Request, Response } from 'express';
import OrderService from '@services/orders';
import { successResponse } from '@utils/response';
import type { SearchOrdersRequest } from '@api/api';
import { userScope } from './helpers';

/**
 * GET /orders
 * List/search orders via query parameters.
 * Non-admin users see only their own orders.
 */
const getOrders = async (request: Request, response: Response): Promise<void> => {
    const { id, page, pageSize, userId, productId, email } = request.query as Record<string, string | undefined>;
    const filters: SearchOrdersRequest = {
        id,
        page: page ? Number(page) : undefined,
        pageSize: pageSize ? Number(pageSize) : undefined,
        userId,
        productId,
        email,
    };
    const result = await OrderService.search(filters, userScope(request));
    successResponse(response, result);
};

export default getOrders;
