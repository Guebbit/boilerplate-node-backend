/**
 * @module
 * POST /delivery/order/:orderId/deliver
 * Staff recording a parcel's arrival — the one door that moves an order `shipped → delivered`.
 */

import type { Request, Response } from 'express';
import type { Shipment } from '@types';
import { DeliverOrderBody } from '@api/schemas.zod';
import { successResponse } from '@infrastructure/http/response';
import { callerContextOf } from '@infrastructure/http/request';
import { deliveryService } from '../service';
import { catchAs, parseBody, refused } from '@infrastructure/http/controller';

/** Handles `POST /delivery/order/:orderId/deliver`. */
export const postDeliverOrder = (request: Request<{ orderId?: string }>, response: Response) => {
    const body = parseBody(DeliverOrderBody, request.body ?? {}, response);
    if (!body) return;

    return deliveryService
        .recordDelivery(
            String(request.params.orderId),
            callerContextOf(request),
            body.forced,
            body.reason
        )
        .then((result) => {
            if (refused(response, result)) return;
            successResponse<Shipment>(response, result.data!);
        })
        .catch(catchAs(response, 'postDeliverOrder'));
};
