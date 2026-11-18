/**
 * @module
 * POST /payments/:id/refunds/sync
 * Staff re-running the import of refunds made in the provider's dashboard. Answers the payment as
 * it now stands, with its `actions`. `create:Refund` at the route, which also carries the
 * fresh-session requirement. Idempotent: a refund already recorded is never imported twice.
 */

import type { Request, Response } from 'express';
import type { Payment } from '@types';
import { successResponse } from '@infrastructure/http/response';
import { paymentService } from '../services';
import { catchAs, refused } from '@infrastructure/http/controller';
import { requireId } from '@infrastructure/http/ids';

/** Handles `POST /payments/:id/refunds/sync`. */
export const postPaymentRefundsSync = (request: Request<{ id?: string }>, response: Response) => {
    const paymentId = requireId(request, response, { notFound: 'payments.not-found' });
    if (!paymentId) return;

    return paymentService
        .syncRefunds(paymentId, request.authContext)
        .then((result) => {
            if (refused(response, result)) return;

            return paymentService
                .presentWithActions(result.data, request.authContext)
                .then((payment) => {
                    successResponse<Payment>(response, payment, 200);
                });
        })
        .catch(catchAs(response, 'postPaymentRefundsSync'));
};
