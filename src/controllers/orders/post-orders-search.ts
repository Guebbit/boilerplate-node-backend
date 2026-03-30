import type { Request, Response } from 'express';
import OrderService from '@services/orders';
import { successResponse } from '@utils/response';
import type { SearchOrdersRequest } from '@api/api';
import { userScope } from './helpers';

/**
 * POST /orders/search
 * Search orders via JSON body.
 * Non-admin users see only their own orders.
 */
const postOrdersSearch = async (request: Request, response: Response): Promise<void> => {
    const body = request.body as SearchOrdersRequest;
    const result = await OrderService.search(body, userScope(request));
    successResponse(response, result);
};

export default postOrdersSearch;
