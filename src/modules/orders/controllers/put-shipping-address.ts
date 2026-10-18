/**
 * @module
 * `PUT /orders/:id/shipping-address` — staff correcting where an unshipped order ships. Thin wiring
 * onto `orderService.correctShippingAddress`; the route's `requirePermission('update', 'Order')`
 * has already confirmed the caller may edit orders.
 */

import type { Request, Response } from 'express';
import { orderService } from '../services';
import { CorrectOrderShippingAddressBody } from '@api/schemas.zod';
import { callerContextOf } from '@infrastructure/http/request';
import { requireId } from '@infrastructure/http/ids';
import { catchAs, parseBody, refused } from '@infrastructure/http/controller';
import { respondWithOrder } from './respond';

/** PUT /orders/:id/shipping-address — replace the address, with nothing else changed. */
export const putShippingAddress = (
    request: Request<{ id?: string }>,
    response: Response
): Promise<void> => {
    const id = requireId(request, response, { notFound: 'orders.not-found' });
    if (!id) return Promise.resolve();

    const body = parseBody(CorrectOrderShippingAddressBody, request.body, response);
    if (!body) return Promise.resolve();

    return orderService
        .correctShippingAddress(id, body, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;

            return respondWithOrder(
                response,
                result.data,
                request.authContext,
                'putShippingAddress'
            );
        })
        .catch(catchAs(response, 'putShippingAddress'));
};
