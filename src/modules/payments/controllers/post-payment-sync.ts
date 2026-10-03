/**
 * @module
 * POST /payments/:id/sync
 * The browser saying it has finished at the provider — a 3-D Secure challenge answered, a wallet
 * sheet closed. Re-reads the provider's own record and applies it, which is what makes the happy
 * path feel synchronous while the webhook stays the authority. Idempotent: a payment already
 * settled answers itself without asking the provider anything.
 */

import type { Request, Response } from 'express';
import type { Payment } from '@types';
import { successResponse } from '@infrastructure/http/response';
import { paymentService } from '../services';
import { presentPayment } from '../presenter';
import { callerContextOf } from '@infrastructure/http/request';
import { requireId } from '@infrastructure/http/ids';
import { catchAs, refused } from '@infrastructure/http/controller';

/** Handles `POST /payments/:id/sync`. */
export const postPaymentSync = (request: Request<{ id?: string }>, response: Response) => {
    const paymentId = requireId(request, response, { notFound: 'payments.not-found' });
    if (!paymentId) return;

    return paymentService
        .syncPayment(paymentId, request.authContext, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;

            successResponse<Payment>(response, presentPayment(result.data), 200, result.message);
        })
        .catch(catchAs(response, 'postPaymentSync'));
};
