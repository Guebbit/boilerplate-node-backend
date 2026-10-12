/**
 * @module
 * POST /delivery/shipments/:id/deliver
 * Staff recording a shipment's arrival — the door that, on the last one, moves the order `shipped →
 * delivered`.
 */

import type { Request, Response } from 'express';
import type { Shipment } from '@types';
import { DeliverShipmentBody } from '@api/schemas.zod';
import { successResponse } from '@infrastructure/http/response';
import { callerContextOf } from '@infrastructure/http/request';
import { requireId } from '@infrastructure/http/ids';
import { deliveryService } from '../services';
import { catchAs, parseBody, refused } from '@infrastructure/http/controller';

/** Handles `POST /delivery/shipments/:id/deliver`. */
export const postDeliverShipment = (request: Request<{ id?: string }>, response: Response) => {
    const id = requireId(request, response, { notFound: 'delivery.shipment-not-found' });
    if (!id) return Promise.resolve();

    const body = parseBody(DeliverShipmentBody, request.body ?? {}, response);
    if (!body) return Promise.resolve();

    return deliveryService
        .deliverShipment(id, body, request.authContext, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            successResponse<Shipment>(response, result.data);
        })
        .catch(catchAs(response, 'postDeliverShipment'));
};
