/**
 * @module
 * POST /delivery/order/:orderId/deliver
 * Staff recording a parcel's arrival — the door that moves an order `shipped → delivered` now.
 */

import type { Request, Response } from 'express';
import type { Shipment } from '@types';
import { successResponse } from '@infrastructure/http/response';
import { callerContextOf } from '@infrastructure/http/request';
import { deliveryService } from '../service';
import { catchAs, refused } from '@infrastructure/http/controller';

/** Handles `POST /delivery/order/:orderId/deliver`. */
export const postDeliverOrder = (request: Request<{ orderId?: string }>, response: Response) =>
    deliveryService
        .recordDelivery(String(request.params.orderId), callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            successResponse<Shipment>(response, result.data!);
        })
        .catch(catchAs(response, 'postDeliverOrder'));
