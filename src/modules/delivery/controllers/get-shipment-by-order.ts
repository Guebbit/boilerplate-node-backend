import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { deliveryService } from '../service';
import { catchAs, refused } from '@infrastructure/http/controller';

/**
 * GET /delivery/order/:orderId
 * The parcel behind an order — tracking code and whether it has arrived. The order page's
 * shipping panel reads this once the status shows `shipped`.
 */
export const getShipmentByOrder = (request: Request<{ orderId?: string }>, response: Response) =>
    deliveryService
        .getForOrder(String(request.params.orderId), request.authContext)
        .then((result) => {
            if (refused(response, result)) return;
            successResponse(response, result.data);
        })
        .catch(catchAs(response, 'getShipmentByOrder'));
