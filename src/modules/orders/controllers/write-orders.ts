/**
 * @module
 * Admin create/update controller for orders — a single POST/PUT handler that creates when no id
 * is present and updates otherwise; see the exported controller's own JSDoc for the branching.
 */

import type { Request, Response } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import { CreateOrderBody, UpdateOrderByIdBody } from '@api/schemas.zod';
import { orderService } from '../services';
import { readInput, callerContextOf } from '@infrastructure/http/request';
import type { CreateOrderRequest, UpdateOrderByIdRequest } from '@types';
import { orderCreatedTotal } from '../metrics';
import { catchAs, refused, rejectValidation } from '@infrastructure/http/controller';
import { respondWithOrder } from './respond';

/**
 * POST /orders — create a new order from an explicit payload (admin).
 * PUT /orders/:id — update an order by path id (admin).
 *
 * Creation bypasses the cart — items come straight from the body — which is what makes this
 * admin rather than the checkout path in `@modules/cart`.
 */
export const writeOrders = (
    request: Request<ParamsDictionary, unknown, CreateOrderRequest | UpdateOrderByIdRequest>,
    response: Response
): Promise<void> => {
    // `path`: `PUT /orders/:id` is the one update route, so an id only ever comes from the path —
    // see docs/theory/request-input.md. Orders carry no multipart variant, so nothing needs decoding.
    const { id } = readInput(request, { surface: 'path', ids: ['id'] });

    /**
     * NO ID = new order
     */
    if (!id) {
        const parseResult = CreateOrderBody.safeParse(request.body);
        if (!parseResult.success) {
            rejectValidation(response, parseResult.error);
            return Promise.resolve();
        }

        const { userId, email, items } = parseResult.data;

        return orderService
            .create(userId, email, items, callerContextOf(request))
            .then((result) => {
                if (refused(response, result)) return;

                // The confirmation mail is `orderService.create`'s — it is a fact about the order,
                // not about the request that asked for one. See `CallerContext.locale`.
                orderCreatedTotal.inc();
                return respondWithOrder(
                    response,
                    result.data,
                    request.authContext,
                    'createOrder',
                    201
                );
            })
            .catch(catchAs(response, 'createOrder'));
    }

    /**
     * ID = edit order
     */
    const parseResult = UpdateOrderByIdBody.safeParse(request.body);
    if (!parseResult.success) {
        rejectValidation(response, parseResult.error);
        return Promise.resolve();
    }

    return orderService
        .updateById(id, parseResult.data, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;

            return respondWithOrder(response, result.data, request.authContext, 'writeOrder');
        })
        .catch(catchAs(response, 'writeOrder'));
};
