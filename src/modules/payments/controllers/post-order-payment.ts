/**
 * @module
 * POST /orders/:id/payments
 * An admin recording money the card provider never saw. Admin-only at the route
 * (`create:Payment`); the audit and analytics events fire from the service once settlement
 * actually lands, same as the confirm.
 */

import type { Request, Response } from 'express';
import type { Payment } from '@types';
import { createdOrOk } from '@infrastructure/http/response';
import { RecordOrderPaymentBody } from '@api/schemas.zod';
import { paymentService } from '../services';
import { catchAs, parseBody, refused } from '@infrastructure/http/controller';
import { callerContextOf } from '@infrastructure/http/request';
import { requireId } from '@infrastructure/http/ids';

/** Handles `POST /orders/:id/payments`. */
export const postOrderPayment = (request: Request<{ id?: string }>, response: Response) => {
    const orderId = requireId(request, response, {
        notFound: 'payments.order-not-found'
    });
    if (!orderId) return;

    const body = parseBody(RecordOrderPaymentBody, request.body, response);
    if (!body) return;

    return paymentService
        .recordOfflinePayment(orderId, body, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            // Only a `succeeded` payment comes back from here, where `pay` is false whatever the
            // order says: no order read is needed for `actions`.
            const payment = paymentService.withActions(result.data, undefined, request.authContext);
            // 201 when a row was inserted; 200 when this converted an unpaid card intent's row.
            createdOrOk<Payment>(response, payment, result.status, `/payments/${payment.id}`);
        })
        .catch(catchAs(response, 'postOrderPayment'));
};
