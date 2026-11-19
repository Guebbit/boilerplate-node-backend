/**
 * @module
 * `PUT /orders/:id/billing-address` — staff correcting who an order is invoiced to. Thin wiring
 * onto `orderService.correctBillingAddress`; the route's `requirePermission('update', 'Order')`
 * has already confirmed the caller may edit orders.
 */

import type { Request, Response } from 'express';
import { orderService } from '../services';
import { CorrectOrderBillingAddressBody } from '@api/schemas.zod';
import { callerContextOf } from '@infrastructure/http/request';
import { requireId } from '@infrastructure/http/ids';
import { catchAs, parseBody, refused } from '@infrastructure/http/controller';
import { respondWithOrder } from './respond';

/**
 * PUT /orders/:id/billing-address — replace the address, with nothing else changed.
 * No `If-Match`: no GET on this URL; a staff fix-up of one field.
 */
export const putBillingAddress = (
    request: Request<{ id?: string }>,
    response: Response
): Promise<void> => {
    const id = requireId(request, response, { notFound: 'orders.not-found' });
    if (!id) return Promise.resolve();

    const body = parseBody(CorrectOrderBillingAddressBody, request.body, response);
    if (!body) return Promise.resolve();

    return orderService
        .correctBillingAddress(id, body, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;

            return respondWithOrder(
                response,
                result.data,
                request.authContext,
                'putBillingAddress'
            );
        })
        .catch(catchAs(response, 'putBillingAddress'));
};
