import type { Request, Response } from 'express';
import OrderService from '@services/orders';
import { successResponse } from '@utils/response';
import type { SearchOrdersRequest } from '../../../api/api';
import { userScope } from './helpers';

/**
 * Query parameters
 */
export interface IGetAllOrdersQueries {
    id?: string
    page?: string
    pageSize?: string
    userId?: string
    productId?: string
    email?: string
}

/**
 * GET /orders
 * List/search orders via query parameters.
 * Non-admin users see only their own orders.
 */
const getOrders = async (request: Request, response: Response): Promise<void> => {
    const { id, page, pageSize, userId, productId, email } = request.query as IGetAllOrdersQueries;
    const filters: SearchOrdersRequest = {
        id,
        page: page ? Number(page) : undefined,
        pageSize: pageSize ? Number(pageSize) : undefined,
        userId,
        productId,
        email,
    };
    /**
     * User role filters:
     * Only admin can see all orders. Regular users can only see their own.
     */
    const result = await OrderService.search(filters, userScope(request));
    successResponse(response, result);
};

export default getOrders;
