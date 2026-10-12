/**
 * @module
 * POST /delivery/fulfillment-orders/:id/fulfill
 * Staff fulfilling a digital fulfillment order — a shipment with no parcel, born delivered.
 */

import type { Request, Response } from 'express';
import type { Shipment } from '@types';
import { successResponse } from '@infrastructure/http/response';
import { callerContextOf } from '@infrastructure/http/request';
import { requireId } from '@infrastructure/http/ids';
import { deliveryService } from '../services';
import { catchAs, refused } from '@infrastructure/http/controller';

/** Handles `POST /delivery/fulfillment-orders/:id/fulfill`. */
export const postFulfillFulfillmentOrder = (
    request: Request<{ id?: string }>,
    response: Response
) => {
    const id = requireId(request, response, { notFound: 'delivery.fulfillment-order-not-found' });
    if (!id) return Promise.resolve();

    return deliveryService
        .fulfillFulfillmentOrder(id, request.authContext, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            successResponse<Shipment>(response, result.data);
        })
        .catch(catchAs(response, 'postFulfillFulfillmentOrder'));
};
