import type { Request, Response } from 'express';
import { t } from 'i18next';
import OrderService from '@services/orders';
import { successResponse, rejectResponse } from '@utils/response';
import { userScope } from './helpers';

/**
 * URL parameters
 */
export interface IGetTargetOrderParameters {
    id?: string,
}

/**
 * GET /orders/:id
 * Get a single order by path id.
 * Non-admin users can only access their own orders.
 */
const getOrderById = async (request: Request, response: Response): Promise<void> => {
    /**
     * User role filters:
     * Only admin can see all orders. Regular users can only see their own.
     */
    const order = await OrderService.getById(String(request.params.id), userScope(request));
    if (!order) {
        rejectResponse(response, 404, 'Not Found', [t('ecommerce.order-not-found')]);
        return;
    }
    successResponse(response, order);
};

export default getOrderById;
