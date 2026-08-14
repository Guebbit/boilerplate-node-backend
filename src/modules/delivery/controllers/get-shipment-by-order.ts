import type { Request, Response } from 'express';
import type { CastError } from 'mongoose';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import { getForOrder } from '../service';

/**
 * GET /delivery/order/:orderId
 * The parcel behind an order — tracking code and whether it has arrived. The order page's
 * shipping panel reads this once the status shows `shipped`.
 */
export const getShipmentByOrder = (request: Request<{ orderId?: string }>, response: Response) =>
    getForOrder(String(request.params.orderId), request.authContext)
        .then((result) => {
            if (!result.success) {
                rejectResponse(response, result.status, result.errors);
                return;
            }
            successResponse(response, result.data);
        })
        .catch((error: CastError | Error) => {
            rejectDatabaseError(response, 'getShipmentByOrder', error);
        });
