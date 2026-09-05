/**
 * @module
 * POST /payments/:id/confirm
 * The card dialog's submit — where the money moves, so where the events fire. A decline is
 * reported like any refusal (409, `PAYMENT_DECLINED`) but still counted and audited: a support
 * thread about a payment starts with "was it us or the card", and the audit row answers it.
 */

import type { Request, Response } from 'express';
import type { Payment } from '@types';
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
            // A success result for this endpoint always carries the confirmed payment; this
            // satisfies the type checker without loosening it.
            if (!result.data) throw new Error('payment confirm succeeded without a payment');
            // `.toJSON()` applies the model's `_id` → `id` / date-to-ISO-string transform.
            successResponse<Payment>(
                response,
                result.data.toJSON() as Payment,
                200,
                result.message
            );
        })
        .catch(catchAs(response, 'postPaymentConfirm'));
};
