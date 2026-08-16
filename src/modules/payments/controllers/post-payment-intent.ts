import type { Request, Response } from 'express';
import type { CastError } from 'mongoose';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import { CreatePaymentIntentBody } from '@api/schemas.zod';
import { paymentService } from '../service';

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
        rejectResponse(
            response,
            422,
            parseResult.error.issues.map(({ message }) => message)
        );
        return Promise.resolve();
    }

    return paymentService
        .createIntent(parseResult.data.orderId, request.authContext)
        .then((result) => {
            if (!result.success) {
                rejectResponse(response, result.status, result.errors);
                return;
            }
            successResponse(response, result.data, 201);
        })
        .catch((error: CastError | Error) => {
            rejectDatabaseError(response, 'postPaymentIntent', error);
        });
};
