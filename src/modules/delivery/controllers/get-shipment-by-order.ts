/**
 * @module
 * GET /delivery/order/:orderId
 * The parcel behind an order — tracking code and whether it has arrived. The order page's
 * shipping panel reads this once the status shows `shipped`.
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { deliveryService } from '../service';
import { catchAs, refused } from '@infrastructure/http/controller';
import type { Shipment } from '@types';

/** Handles `GET /delivery/order/:orderId`. */
export const getShipmentByOrder = (request: Request<{ orderId?: string }>, response: Response) =>
    deliveryService
        .getForOrder(String(request.params.orderId), request.authContext)
        .then((result) => {
            if (refused(response, result)) return;
            // `refused` narrows on `success` but not `result`'s type; `data` is always set here.
            successResponse<Shipment>(response, result.data!);
        })
        .catch(catchAs(response, 'getShipmentByOrder'));
