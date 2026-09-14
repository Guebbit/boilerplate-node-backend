/**
 * @module
 * POST /payments/order/:orderId/offline
 * An admin recording money the card provider never saw. Admin-only at the route
 * (`payments.any.create`); the audit and analytics events fire from the service once settlement
 * actually lands, same as the confirm.
 */

import type { Request, Response } from 'express';
import type { Payment } from '@types';
import { successResponse } from '@infrastructure/http/response';
import { RecordOfflinePaymentBody } from '@api/schemas.zod';
import { paymentService } from '../services';
import { catchAs, parseBody, refused } from '@infrastructure/http/controller';
import { callerContextOf } from '@infrastructure/http/request';

/** Handles `POST /payments/order/:orderId/offline`. */
export const postPaymentOffline = (request: Request<{ orderId?: string }>, response: Response) => {
    const body = parseBody(RecordOfflinePaymentBody, request.body, response);
    if (!body) return;

    return paymentService
        .recordOfflinePayment(String(request.params.orderId), body, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            // A success result for this endpoint always carries the settled payment; this
            // satisfies the type checker without loosening it.
            if (!result.data) throw new Error('offline payment recorded without a payment');
            // `.toJSON()` applies the model's `_id` → `id` / date-to-ISO-string transform.
            successResponse<Payment>(
                response,
                result.data.toJSON() as Payment,
                201,
                result.message
            );
        })
        .catch(catchAs(response, 'postPaymentOffline'));
};
