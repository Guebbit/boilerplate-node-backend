import type { Request, Response } from 'express';
import OrderService from '@services/orders';
import { successResponse } from '@utils/response';
import type { SearchOrdersRequest } from '@types';
import { userScope } from './helpers';

/**
 * POST /orders/search
 * Search orders via JSON body.
 * Non-admin users see only their own orders.
 */
const postOrdersSearch = (request: Request, response: Response): Promise<void> => {
    const body = request.body as SearchOrdersRequest;
    return OrderService.search(body, userScope(request)).then((result) => {
        successResponse(response, result);
    });
};

export default postOrdersSearch;
