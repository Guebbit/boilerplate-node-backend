/**
 * @module
 * POST /payments/order/:orderId/offline
 * An admin recording money the card provider never saw. Admin-only at the route
 * (`payments.any.create`); the audit and analytics events fire from the service once settlement
 * actually lands, same as the confirm.
 */

import type { Request, Response } from 'express';
import type { Payment } from '@types';
import { createdResponse } from '@infrastructure/http/response';
import { RecordOfflinePaymentBody } from '@api/schemas.zod';
import { paymentService } from '../services';
import { presentPayment } from '../presenter';
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
            const payment = presentPayment(result.data);
            createdResponse<Payment>(response, payment, `/payments/${payment.id}`, result.message);
        })
        .catch(catchAs(response, 'postPaymentOffline'));
};
