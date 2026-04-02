import type { Request, Response } from 'express';
import { t } from 'i18next';
import { orderService } from '@services/orders';
import { successResponse, rejectResponse } from '@utils/response';
import { userScope } from '@utils/helpers-scopes';

/**
 * GET /orders/:id
 * Get a single order by path id.
 * Non-admin users can only access their own orders.
 */
export const getOrderItem = (request: Request<{ id?: string }>, response: Response) =>
    /**
     * User role filters:
     * Only admin can see all orders. Regular users can only see their own.
     */
    orderService
        .getById(String(request.params.id), userScope(request))
        .then((order) => {
            if (!order) {
                rejectResponse(response, 404, 'Not Found', [t('ecommerce.order-not-found')]);
                return;
            }
            successResponse(response, order);
        })
        .catch((error: Error) => {
            if (error.message == '404')
                rejectResponse(response, 404, 'getOrder - not found', [
                    t('ecommerce.order-not-found')
                ]);
            rejectResponse(response, 500, 'Unknown Error', [error.message]);
        });
