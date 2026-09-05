/**
 * @module
 * Order cancellation controller — the one order write a customer can make; thin wiring onto
 * `orderService.cancelById`, which carries the caller's scope down into the write itself.
 */

import type { Request, Response } from 'express';
import { t } from '@infrastructure/i18n';
import { orderService } from '../service';
import type { CancelOrderRequest, Order } from '@types';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { callerContextOf } from '@infrastructure/http/request';
import { catchAs, refused } from '@infrastructure/http/controller';

/**
 * POST /orders/:id/cancel — the one order write a customer can make.
 *
 * The service scopes the write to the caller: a non-admin can only cancel their own order, from
 * the statuses the lifecycle allows a customer; an admin can cancel any order. `refund` is the
 * caller's choice but only honored for admins — a customer's cancel is always refunded.
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
            // `ResponseSuccess.data` is optional at the type level for endpoints with no payload;
            // `cancelById` always resolves one on success, so this is exhaustiveness.
            if (!result.data) return rejectResponse(response, 500, [t('generic.error-internal')]);

            successResponse<Order>(
                response,
                orderService.withActions(result.data, request.authContext),
                200,
                result.message
            );
        })
        .catch(catchAs(response, 'postCancelOrder'));
