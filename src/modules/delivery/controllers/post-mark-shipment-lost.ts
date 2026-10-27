/**
 * @module
 * POST /delivery/shipments/:id/lost
 * Staff reporting a parcel lost or damaged in transit.
 */

import type { Request, Response } from 'express';
import type { Shipment } from '@types';
import { MarkShipmentLostBody } from '@api/schemas.zod';
import { successResponse } from '@infrastructure/http/response';
import { callerContextOf } from '@infrastructure/http/request';
import { requireId } from '@infrastructure/http/ids';
import { deliveryService } from '../services';
import { catchAs, parseBody, refused } from '@infrastructure/http/controller';

/** Handles `POST /delivery/shipments/:id/lost`. */
export const postMarkShipmentLost = (request: Request<{ id?: string }>, response: Response) => {
    const id = requireId(request, response, { notFound: 'delivery.shipment-not-found' });
    if (!id) return Promise.resolve();

    const body = parseBody(MarkShipmentLostBody, request.body, response);
    if (!body) return Promise.resolve();

    return deliveryService
        .markShipmentLost(id, body, request.authContext, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            successResponse<Shipment>(response, result.data);
        })
        .catch(catchAs(response, 'postMarkShipmentLost'));
};
