/**
 * @module
 * POST /payments/order/:orderId/offline
 * An admin recording money the card provider never saw. Admin-only at the route
 * (`payments.any.create`); the audit and analytics events fire from the service once settlement
 * actually lands, same as the confirm.
 */

import type { Request, Response } from 'express';
import type { Payment } from '@types';
import { createdOrOk } from '@infrastructure/http/response';
import { RecordOfflinePaymentBody } from '@api/schemas.zod';
import { paymentService } from '../services';
import { presentPayment } from '../presenter';
import { catchAs, parseBody, refused } from '@infrastructure/http/controller';
import { callerContextOf } from '@infrastructure/http/request';
import { requireId } from '@infrastructure/http/ids';

/** Handles `POST /payments/order/:orderId/offline`. */
export const postPaymentOffline = (request: Request<{ orderId?: string }>, response: Response) => {
    const orderId = requireId(request, response, {
        notFound: 'payments.order-not-found',
        name: 'orderId'
    });
    if (!orderId) return;

    const body = parseBody(RecordOfflinePaymentBody, request.body, response);
    if (!body) return;

    return paymentService
        .recordOfflinePayment(orderId, body, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            const payment = presentPayment(result.data);
            // 201 when a row was inserted; 200 when this converted an unpaid card intent's row.
            createdOrOk<Payment>(
                response,
                payment,
                result.status,
                `/payments/${payment.id}`,
                result.message
            );
        })
        .catch(catchAs(response, 'postPaymentOffline'));
};
