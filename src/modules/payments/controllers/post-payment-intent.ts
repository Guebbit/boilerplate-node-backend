import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { CreatePaymentIntentBody } from '@api/schemas.zod';
import { paymentService } from '../service';
import { catchAs, refused, rejectValidation } from '@infrastructure/http/controller';

/**
 * POST /payments/intent
 * Freeze an order's price into a payment intent, ready to confirm.
 *
 * Thin on purpose: ownership, the `pending` gate and the amount all live in the service. No
 * audit and no analytics here — an intent is a page load's preparation, not a business event;
 * the events fire on the confirm, where money actually moves.
 */
export const postPaymentIntent = (request: Request, response: Response) => {
    const parseResult = CreatePaymentIntentBody.safeParse(request.body ?? {});
    if (!parseResult.success) {
        rejectValidation(response, parseResult.error);
        return Promise.resolve();
    }

    return paymentService
        .createIntent(parseResult.data.orderId, request.authContext)
        .then((result) => {
            if (refused(response, result)) return;
            successResponse(response, result.data, 201);
        })
        .catch(catchAs(response, 'postPaymentIntent'));
};
