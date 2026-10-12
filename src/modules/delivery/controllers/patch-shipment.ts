/**
 * @module
 * PATCH /delivery/shipments/:id
 * Staff correcting a shipment's tracking code.
 */

import type { Request, Response } from 'express';
import type { Shipment } from '@types';
import { UpdateShipmentBody } from '@api/schemas.zod';
import { successResponse } from '@infrastructure/http/response';
import { callerContextOf } from '@infrastructure/http/request';
import { requireId } from '@infrastructure/http/ids';
import { deliveryService } from '../services';
import { catchAs, parseBody, refused } from '@infrastructure/http/controller';

/** Handles `PATCH /delivery/shipments/:id`. */
export const patchShipment = (request: Request<{ id?: string }>, response: Response) => {
    const id = requireId(request, response, { notFound: 'delivery.shipment-not-found' });
    if (!id) return Promise.resolve();

    const body = parseBody(UpdateShipmentBody, request.body, response);
    if (!body) return Promise.resolve();

    return deliveryService
        .editShipmentTracking(id, body.trackingCode, request.authContext, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            successResponse<Shipment>(response, result.data);
        })
        .catch(catchAs(response, 'patchShipment'));
};
