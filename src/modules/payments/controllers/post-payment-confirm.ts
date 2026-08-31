/**
 * @module
 * POST /payments/:id/confirm
 * The card dialog's submit — where the money moves, so where the events fire. A decline is
 * reported like any refusal (409, `PAYMENT_DECLINED`) but still counted and audited: a support
 * thread about a payment starts with "was it us or the card", and the audit row answers it.
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { ConfirmPaymentBody } from '@api/schemas.zod';
import { paymentConfirmTotal } from '../metrics';
import { paymentService } from '../service';
import { callerContextOf } from '@infrastructure/http/request';
import { catchAs, parseBody, refused } from '@infrastructure/http/controller';

/** Handles `POST /payments/:id/confirm`. */
export const postPaymentConfirm = (request: Request<{ id?: string }>, response: Response) => {
    const body = parseBody(ConfirmPaymentBody, request.body, response);
    if (!body) return;

    const paymentId = String(request.params.id);
    return paymentService
        .confirmPayment(
            paymentId,
            { cardNumber: body.cardNumber },
            request.authContext,
            callerContextOf(request)
        )
        .then((result) => {
            const declined =
                !result.success && result.errors.some(({ code }) => code === 'PAYMENT_DECLINED');
            // Counted outcomes only: not-found/race rejections aren't confirm attempts.
            if (result.success || declined)
                paymentConfirmTotal.inc({ outcome: result.success ? 'succeeded' : 'declined' });

            if (refused(response, result)) return;
            successResponse(response, result.data, 200, result.message);
        })
        .catch(catchAs(response, 'postPaymentConfirm'));
};
