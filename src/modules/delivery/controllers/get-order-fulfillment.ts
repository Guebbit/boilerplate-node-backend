/**
 * @module
 * GET /delivery/order/:orderId
 * Where an order's goods stand: its fulfillment orders and the shipments cut from them. The order
 * page's shipping panel reads this once the order is paid; before that both lists are empty.
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { requireId } from '@infrastructure/http/ids';
import { deliveryService } from '../services';
import { catchAs, refused } from '@infrastructure/http/controller';
import type { OrderFulfillment } from '@types';

/** Handles `GET /delivery/order/:orderId`. */
export const getOrderFulfillment = (request: Request<{ orderId?: string }>, response: Response) => {
    const orderId = requireId(request, response, {
        notFound: 'delivery.order-not-found',
        name: 'orderId'
    });
    if (!orderId) return Promise.resolve();

    return deliveryService
        .getForOrder(orderId, request.authContext)
        .then((result) => {
            if (refused(response, result)) return;
            successResponse<OrderFulfillment>(response, result.data);
        })
        .catch(catchAs(response, 'getOrderFulfillment'));
};
