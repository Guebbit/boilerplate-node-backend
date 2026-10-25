/**
 * @module
 * GET /delivery/fulfillment-orders/:id
 * One fulfillment order, for the buyer whose order it belongs to and the staff who see every order.
 */

import type { Request, Response } from 'express';
import type { FulfillmentOrder } from '@types';
import { successResponse } from '@infrastructure/http/response';
import { requireId } from '@infrastructure/http/ids';
import { deliveryService } from '../services';
import { catchAs, refused } from '@infrastructure/http/controller';

/** Handles `GET /delivery/fulfillment-orders/:id`. */
export const getFulfillmentOrder = (request: Request<{ id?: string }>, response: Response) => {
    const id = requireId(request, response, { notFound: 'delivery.fulfillment-order-not-found' });
    if (!id) return Promise.resolve();

    return deliveryService
        .getFulfillmentOrder(id, request.authContext)
        .then((result) => {
            if (refused(response, result)) return;
            successResponse<FulfillmentOrder>(response, result.data);
        })
        .catch(catchAs(response, 'getFulfillmentOrder'));
};
