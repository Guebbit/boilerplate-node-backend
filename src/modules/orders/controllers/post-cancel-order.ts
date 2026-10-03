/**
 * @module
 * Order cancellation controller — the one order write a customer can make; thin wiring onto
 * `orderService.cancelById`, which carries the caller's scope down into the write itself.
 */

import type { Request, Response } from 'express';
import { orderService } from '../services';
import type { CancelOrderRequest } from '@types';
import { CancelOrderByIdBody } from '@api/schemas.zod';
import { callerContextOf } from '@infrastructure/http/request';
import { requireId } from '@infrastructure/http/ids';
import { catchAs, parseBody, refused } from '@infrastructure/http/controller';
import { respondWithOrder } from './respond';

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
): Promise<void> => {
    // A malformed id answers as an unknown order, before the body is read.
    const id = requireId(request, response, { notFound: 'orders.not-found' });
    if (!id) return Promise.resolve();

    // Parsed, not read raw: `refund` decides whether money goes back, and a raw `"false"` is a
    // truthy string. An absent body parses as `{}`, which the schema's default turns into
    // `refund: true`.
    const body = parseBody(CancelOrderByIdBody, request.body ?? {}, response);
    if (!body) return Promise.resolve();

    return orderService
        .cancelById(id, request.authContext, { refund: body.refund }, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;

            return respondWithOrder(
                response,
                result.data,
                request.authContext,
                'postCancelOrder',
                200,
                result.message
            );
        })
        .catch(catchAs(response, 'postCancelOrder'));
};
