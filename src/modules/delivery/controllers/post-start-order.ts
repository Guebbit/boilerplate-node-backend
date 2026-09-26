/**
 * @module
 * POST /delivery/order/:orderId/start
 * Staff reporting that fulfilment has started on a paid order — the one door that moves an order
 * `paid → processing`, before any parcel exists to record.
 */

import type { Request, Response } from 'express';
import type { Order } from '@types';
import { successResponse } from '@infrastructure/http/response';
import { callerContextOf } from '@infrastructure/http/request';
import { deliveryService } from '../service';
import { catchAs, refused } from '@infrastructure/http/controller';

/** Handles `POST /delivery/order/:orderId/start`. */
export const postStartOrder = (request: Request<{ orderId?: string }>, response: Response) =>
    deliveryService
        .startFulfilment(
            String(request.params.orderId),
            request.authContext,
            callerContextOf(request)
        )
        .then((result) => {
            if (refused(response, result)) return;
            successResponse<Order>(response, result.data);
        })
        .catch(catchAs(response, 'postStartOrder'));
