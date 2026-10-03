/**
 * @module
 * GET /delivery/order/:orderId
 * The parcel behind an order — tracking code and whether it has arrived. The order page's
 * shipping panel reads this once the status shows `shipped`.
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { requireId } from '@infrastructure/http/ids';
import { deliveryService } from '../service';
import { catchAs, refused } from '@infrastructure/http/controller';
import type { Shipment } from '@types';

/** Handles `GET /delivery/order/:orderId`. */
export const getShipmentByOrder = (request: Request<{ orderId?: string }>, response: Response) => {
    const orderId = requireId(request, response, {
        notFound: 'delivery.order-not-found',
        name: 'orderId'
    });
    if (!orderId) return Promise.resolve();

    return deliveryService
        .getForOrder(orderId, request.authContext)
        .then((result) => {
            if (refused(response, result)) return;
            successResponse<Shipment>(response, result.data);
        })
        .catch(catchAs(response, 'getShipmentByOrder'));
};
