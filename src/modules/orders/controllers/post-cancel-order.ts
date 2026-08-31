/**
 * @module
 * Order cancellation controller — the one order write a customer can make; thin wiring onto
 * `orderService.cancelById`, which carries the caller's scope down into the write itself.
 */

import type { Request, Response } from 'express';
import { orderService } from '../service';
import type { CancelOrderRequest } from '@types';
import { successResponse } from '@infrastructure/http/response';
import { callerContextOf } from '@infrastructure/http/request';
import { catchAs, refused } from '@infrastructure/http/controller';

/**
 * POST /orders/:id/cancel
 * Cancel an order — the one order write a customer can make.
 *
 * The service's conditional write carries the caller's scope, so a non-admin can only cancel an
 * order they can see (their own, not soft-deleted) and only from the statuses the lifecycle gives
 * a customer. An admin cancels anyone's — the same privilege the admin status write grants,
 * spelled as the same endpoint the customer uses.
 *
 * `refund` is the operator's choice of whether the money goes back with the cancellation; the
 * service ignores it for a customer, who is always refunded.
 */
export const postCancelOrder = (
    // The body is OPTIONAL on this route — a customer's cancel sends none — and Express leaves
    // `request.body` undefined rather than empty when there is nothing to parse.
    request: Request<{ id?: string }, unknown, CancelOrderRequest | undefined>,
    response: Response
) =>
    orderService
        .cancelById(
            String(request.params.id),
            request.authContext,
            { refund: request.body?.refund },
            callerContextOf(request)
        )
        .then((result) => {
            if (refused(response, result)) return;

            successResponse(
                response,
                orderService.withActions(result.data, request.authContext),
                200,
                result.message
            );
        })
        .catch(catchAs(response, 'postCancelOrder'));
