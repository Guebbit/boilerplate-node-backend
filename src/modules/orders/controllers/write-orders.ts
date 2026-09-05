/**
 * @module
 * Admin create/update controller for orders — a single POST/PUT handler that creates when no id
 * is present and updates otherwise; see the exported controller's own JSDoc for the branching.
 */

import type { Request, Response } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import { t } from '@infrastructure/i18n';
import { CreateOrderBody, UpdateOrderBody, UpdateOrderByIdBody } from '@api/schemas.zod';
import { orderService } from '../service';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { readInput, callerContextOf } from '@infrastructure/http/request';
import type { CreateOrderRequest, UpdateOrderRequest, UpdateOrderByIdRequest, Order } from '@types';
import { orderCreatedTotal } from '../metrics';
import { catchAs, refused, rejectValidation } from '@infrastructure/http/controller';

/**
 * POST /orders — create a new order from an explicit payload (admin).
 * PUT /orders(/:id) — update an order by body or path id (admin); PUT without an id is 422.
 *
 * Creation bypasses the cart — items come straight from the body — which is what makes this
 * admin rather than the checkout path in `@modules/cart`.
 */
export const writeOrders = (
    request: Request<
        ParamsDictionary,
        unknown,
        CreateOrderRequest | UpdateOrderRequest | UpdateOrderByIdRequest
    >,
    response: Response
) => {
    // One declaration instead of reading `request.params.id` and the body separately — see
    // docs/theory/request-input.md. Orders carry no multipart variant, so nothing needs decoding.
    const { id } = readInput(request, { surface: 'write', ids: ['id'] });

    /**
     * NO ID = new order
     */
    if (!id) {
        // PUT without an id is invalid
        if (request.method === 'PUT') {
            rejectResponse(response, 422, [t('generic.error-missing-data')]);
            return Promise.resolve();
        }

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
                // `ResponseSuccess.data` is optional at the type level for endpoints with no
                // payload; `create` always resolves one on success, so this is exhaustiveness.
                if (!result.data)
                    return rejectResponse(response, 500, [t('generic.error-internal')]);

                // The confirmation mail is `orderService.create`'s — it is a fact about the order,
                // not about the request that asked for one. See `CallerContext.locale`.
                orderCreatedTotal.inc();
                successResponse<Order>(
                    response,
                    orderService.withActions(result.data, request.authContext),
                    201
                );
            })
            .catch(catchAs(response, 'createOrder'));
    }

    /**
     * ID = edit order
     */
    // UpdateOrderBody requires `id` in the body; UpdateOrderByIdBody takes it from the path instead.
    const schema = request.params.id ? UpdateOrderByIdBody : UpdateOrderBody;
    const parseResult = schema.safeParse(request.body);
    if (!parseResult.success) {
        rejectValidation(response, parseResult.error);
        return Promise.resolve();
    }

    return orderService
        .updateById(id, parseResult.data, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            // `ResponseSuccess.data` is optional at the type level for endpoints with no payload;
            // `updateById` always resolves one on success, so this is exhaustiveness.
            if (!result.data) return rejectResponse(response, 500, [t('generic.error-internal')]);

            successResponse<Order>(
                response,
                orderService.withActions(result.data, request.authContext)
            );
        })
        .catch(catchAs(response, 'writeOrder'));
};
