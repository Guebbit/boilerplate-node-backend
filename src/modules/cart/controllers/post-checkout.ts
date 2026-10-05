/**
 * @module
 * `POST /cart/checkout` controller — thin HTTP adapter over `cartService.orderConfirm`, plus the
 * `cart_checkout_total` metric increment on both outcomes.
 */

import type { Request, Response } from 'express';
import { t } from '@infrastructure/i18n';
import { CheckoutBody } from '@api/schemas.zod';
import { cartService } from '../services';
import { createdResponse } from '@infrastructure/http/response';
import { catchAs, parseBody, refused } from '@infrastructure/http/controller';
import { cartCheckoutTotal } from '../metrics';
import { callerContextOf } from '@infrastructure/http/request';
import { orderService } from '@modules/orders';
import type { Order } from '@types';

/**
 * POST /cart/checkout
 * Converts the cart into an order and clears the cart.
 * `cart_checkout_total` increments once per call, before `refused()`, on both outcomes —
 * a failed checkout is still a result the business metric must record.
 */
export const postCheckout = (request: Request, response: Response) => {
    const userId = request.authContext!.id;
    // The body is required (it names `expectedTotal`); a missing one reaches the schema as `undefined`
    // and answers 422 like any other malformed body.
    const body = parseBody(CheckoutBody, request.body as unknown, response);
    if (!body) return;

    return cartService
        .orderConfirm(userId, callerContextOf(request), body)
        .then((result) => {
            cartCheckoutTotal.inc({ status: result.success ? 'success' : 'failure' });
            if (refused(response, result)) return;

            // `withActions` is the one place an `OrderDocument` becomes the wire shape — it also
            // resolves each line's live `current` picture, which a bare `.toJSON()` here would
            // leave off the response entirely.
            return orderService.withActions(result.data, request.authContext).then((order) => {
                // The order itself, as `POST /orders` answers it: a 201 describes the resource it
                // created, and the confirmation copy is the envelope's own `message`.
                createdResponse<Order>(
                    response,
                    order,
                    `/orders/${order.id}`,
                    t('orders.creation-success')
                );
            });
        })
        .catch((error: unknown) => {
            // A thrown error is a failed checkout too — record it before delegating.
            cartCheckoutTotal.inc({ status: 'failure' });
            catchAs(response, 'postCheckout')(error);
        });
};
