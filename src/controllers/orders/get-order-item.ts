import type { Request, Response } from 'express';
import { t } from '@core/i18n';
import { orderService } from '@services/orders';
import { successResponse, rejectResponse } from '@core/http/response';
import type { CastError } from 'mongoose';

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
        .getById(String(request.params.id), orderService.callerScope(request.authContext))
        .then((order) => {
            if (!order) {
                rejectResponse(response, 404, 'getOrderItem - not found', [
                    t('ecommerce.order-not-found')
                ]);
                return;
            }
            successResponse(response, order);
        })
        .catch((error: CastError) => {
            if (error.message === '404' || error.kind === 'ObjectId')
                return rejectResponse(response, 404, 'getOrderItem - not found', [
                    t('ecommerce.order-not-found')
                ]);
            rejectResponse(response, 500, 'getOrderItem', [error.message]);
        });
