import type { Request, Response } from 'express';
import type { CastError } from 'mongoose';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import { paymentService } from '../service';

/**
 * GET /payments/order/:orderId
 * The payment behind an order — the order page's payment panel reads this on load, so a reload
 * mid-flow finds the intent (and its status) again instead of starting over.
 */
export const getPaymentByOrder = (request: Request<{ orderId?: string }>, response: Response) =>
    paymentService
        .getForOrder(String(request.params.orderId), request.authContext)
        .then((result) => {
            if (!result.success) {
                rejectResponse(response, result.status, result.errors);
                return;
            }
            successResponse(response, result.data);
        })
        .catch((error: CastError | Error) => {
            rejectDatabaseError(response, 'getPaymentByOrder', error);
        });
