/**
 * @module
 * POST /delivery/fulfillment-orders/:id/shipments
 * Staff cutting a shipment from a fulfillment order — some or all of what remains of it.
 */

import type { Request, Response } from 'express';
import type { Shipment } from '@types';
import { createdResponse } from '@infrastructure/http/response';
import { callerContextOf } from '@infrastructure/http/request';
import { requireId } from '@infrastructure/http/ids';
import { ShipFulfillmentOrderBody } from '@api/schemas.zod';
import { deliveryService } from '../services';
import { catchAs, parseBody, refused } from '@infrastructure/http/controller';

/** Handles `POST /delivery/fulfillment-orders/:id/shipments`. */
export const postShipFulfillmentOrder = (request: Request<{ id?: string }>, response: Response) => {
    const id = requireId(request, response, { notFound: 'delivery.fulfillment-order-not-found' });
    if (!id) return Promise.resolve();

    const body = parseBody(ShipFulfillmentOrderBody, request.body ?? {}, response);
    if (!body) return Promise.resolve();

    return deliveryService
        .shipFulfillmentOrder(id, body, request.authContext, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            createdResponse<Shipment>(
                response,
                result.data,
                `/delivery/order/${result.data.orderId}`
            );
        })
        .catch(catchAs(response, 'postShipFulfillmentOrder'));
};
