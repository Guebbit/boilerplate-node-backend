/**
 * @module
 * `POST /orders` — admin creates an order directly from an explicit payload, bypassing the cart
 * (`items` come straight from the body). What makes this admin rather than the checkout path in
 * `@modules/cart`.
 */

import type { Request, Response } from 'express';
import { CreateOrderBody } from '@api/schemas.zod';
import type { CreateOrderRequest } from '@types';
import { orderService } from '../services';
import { callerContextOf } from '@infrastructure/http/request';
import { orderCreatedTotal } from '../metrics';
import { catchAs, parseBody, refused } from '@infrastructure/http/controller';
import { respondWithOrder } from './respond';

/** `POST /orders` — create a new order from an explicit payload (admin). */
export const createOrder = (
    request: Request<unknown, unknown, CreateOrderRequest>,
    response: Response
): Promise<void> => {
    const body = parseBody(CreateOrderBody, request.body, response);
    if (!body) return Promise.resolve();

    const { userId, email, items } = body;

    return orderService
        .create(userId, email, items, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;

            // The confirmation mail is `orderService.create`'s — it is a fact about the order,
            // not about the request that asked for one. See `CallerContext.locale`.
            orderCreatedTotal.inc();
            return respondWithOrder(response, result.data, request.authContext, 'createOrder', 201);
        })
        .catch(catchAs(response, 'createOrder'));
};
