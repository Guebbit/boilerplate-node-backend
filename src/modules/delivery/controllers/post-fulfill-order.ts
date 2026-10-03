/**
 * @module
 * POST /delivery/order/:orderId/fulfill
 * Staff marking a digital-only order fulfilled — the door that moves an order `processing →
 * delivered` with no parcel record at all, the alternative to `ship`/`deliver` for an order with
 * nothing to physically hand over.
 */

import type { Request, Response } from 'express';
import type { Order } from '@types';
import { successResponse } from '@infrastructure/http/response';
import { callerContextOf } from '@infrastructure/http/request';
import { requireId } from '@infrastructure/http/ids';
import { deliveryService } from '../service';
import { catchAs, refused } from '@infrastructure/http/controller';

/** Handles `POST /delivery/order/:orderId/fulfill`. */
export const postFulfillOrder = (request: Request<{ orderId?: string }>, response: Response) => {
    const orderId = requireId(request, response, {
        notFound: 'delivery.order-not-found',
        name: 'orderId'
    });
    if (!orderId) return Promise.resolve();

    return deliveryService
        .fulfillOrder(orderId, request.authContext, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            successResponse<Order>(response, result.data);
        })
        .catch(catchAs(response, 'postFulfillOrder'));
};
