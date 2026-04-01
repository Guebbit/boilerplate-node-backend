import type { Request, Response } from 'express';
import { orderService } from '@services/orders';
import { successResponse } from '@utils/response';
import type { SearchOrdersRequest } from '@types';
import { userScope } from '@utils/helpers-scopes';

/**
 * POST /orders/search
 * Search orders via JSON body.
 * Non-admin users see only their own orders.
 */
export const postOrdersSearch = (
    request: Request<unknown, unknown, SearchOrdersRequest>,
    response: Response
) =>
    orderService.search(request.body, userScope(request as Request)).then((result) => {
        successResponse(response, result);
    });
