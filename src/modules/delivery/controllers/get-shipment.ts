/**
 * @module
 * GET /delivery/shipments/:id
 * One shipment, for the staff who may correct it.
 */

import type { Request, Response } from 'express';
import type { Shipment } from '@types';
import { successResponse } from '@infrastructure/http/response';
import { requireId } from '@infrastructure/http/ids';
import { deliveryService } from '../services';
import { catchAs, refused } from '@infrastructure/http/controller';

/** Handles `GET /delivery/shipments/:id`. */
export const getShipment = (request: Request<{ id?: string }>, response: Response) => {
    const id = requireId(request, response, { notFound: 'delivery.shipment-not-found' });
    if (!id) return Promise.resolve();

    return deliveryService
        .getShipment(id, request.authContext)
        .then((result) => {
            if (refused(response, result)) return;
            successResponse<Shipment>(response, result.data);
        })
        .catch(catchAs(response, 'getShipment'));
};
