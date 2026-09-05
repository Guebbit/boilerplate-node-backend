/**
 * @module
 * `POST /cart/checkout` controller — thin HTTP adapter over `cartService.orderConfirm`, plus the
 * `cart_checkout_total` metric increment on both outcomes.
 */

import type { Request, Response } from 'express';
import { t } from '@infrastructure/i18n';
import { cartService } from '../services';
import { successResponse } from '@infrastructure/http/response';
import { catchAs, refused } from '@infrastructure/http/controller';
import { cartCheckoutTotal } from '../metrics';
import { authContextOf, callerContextOf } from '@infrastructure/http/request';
import type { OrderDocument } from '@modules/orders';
import type { CheckoutResponse, Order } from '@types';

/**
 * The order as `CheckoutResponse` declares it. `toJSON()`'s static type mirrors the stored
 * document, not the transform `orders/model.ts` wires into the schema (`_id` → `id`, totals
 * derived) — the same `unknown`-typed handoff `orderService.withActions` uses for this boundary.
 */
const toOrderResponse = (order: OrderDocument): Order => {
    const serialized: unknown = order.toJSON();
    return serialized as Order;
};

/**
 * POST /cart/checkout
 * Converts the cart into an order and clears the cart.
 * `cart_checkout_total` increments once per call, before `refused()`, on both outcomes —
 * a failed checkout is still a result the business metric must record.
 */
export const postCheckout = (request: Request, response: Response) => {
    const userId = authContextOf(request).id;
    // `?? {}` because a checkout without a body is legal and Express 5 leaves `body` undefined.
    const { addressId, shippingMethodId } = (request.body ?? {}) as {
        addressId?: string;
        shippingMethodId?: string;
    };
    return cartService
        .orderConfirm(userId, callerContextOf(request), addressId, shippingMethodId)
        .then((result) => {
            cartCheckoutTotal.inc({ status: result.success ? 'success' : 'failure' });
            if (refused(response, result)) return;

            // `refused` narrows on `success` but not `result`'s type; `data` is always set here.
            successResponse<CheckoutResponse>(
                response,
                { order: toOrderResponse(result.data!), message: t('orders.creation-success') },
                201
            );
        })
        .catch((error: Error) => {
            // A thrown error is a failed checkout too — record it before delegating.
            cartCheckoutTotal.inc({ status: 'failure' });
            catchAs(response, 'postCheckout')(error);
        });
};
