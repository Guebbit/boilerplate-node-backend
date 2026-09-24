/**
 * @module
 * POST /delivery/order/:orderId/ship
 * Staff recording a parcel's handover to the carrier — the one door that moves an order
 * `processing → shipped`.
 */

import type { Request, Response } from 'express';
import type { Shipment } from '@types';
import { successResponse } from '@infrastructure/http/response';
import { callerContextOf } from '@infrastructure/http/request';
import { ShipOrderBody } from '@api/schemas.zod';
import { deliveryService } from '../service';
import { catchAs, parseBody, refused } from '@infrastructure/http/controller';

/** Handles `POST /delivery/order/:orderId/ship`. */
export const postShipOrder = (request: Request<{ orderId?: string }>, response: Response) => {
    const body = parseBody(ShipOrderBody, request.body ?? {}, response);
    if (!body) return;

    return deliveryService
        .recordShipment(
            String(request.params.orderId),
            body.trackingCode,
            callerContextOf(request),
            body.forced,
            body.reason
        )
        .then((result) => {
            if (refused(response, result)) return;
            successResponse<Shipment>(response, result.data);
        })
        .catch(catchAs(response, 'postShipOrder'));
};
