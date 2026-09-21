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
import { callerContextOf } from '@infrastructure/http/request';
import { orderService } from '@modules/orders';
import type { CheckoutResponse } from '@types';

/**
 * POST /cart/checkout
 * Converts the cart into an order and clears the cart.
 * `cart_checkout_total` increments once per call, before `refused()`, on both outcomes —
 * a failed checkout is still a result the business metric must record.
 */
export const postCheckout = (request: Request, response: Response): Promise<void> => {
    const userId = request.authContext!.id;
    // `?? {}` because a checkout without a body is legal and Express 5 leaves `body` undefined.
    const { addressId, shippingMethodId, paymentMethod } = (request.body ?? {}) as {
        addressId?: string;
        shippingMethodId?: string;
        paymentMethod?: string;
    };
    return cartService
        .orderConfirm(userId, callerContextOf(request), addressId, shippingMethodId, paymentMethod)
        .then((result) => {
            cartCheckoutTotal.inc({ status: result.success ? 'success' : 'failure' });
            if (refused(response, result)) return;

            // `withActions` is the one place an `OrderDocument` becomes the wire shape — it also
            // resolves each line's live `current` picture, which a bare `.toJSON()` here would
            // leave off the response entirely.
            return orderService.withActions(result.data, request.authContext).then((order) => {
                successResponse<CheckoutResponse>(
                    response,
                    { order, message: t('orders.creation-success') },
                    201
                );
            });
        })
        .catch((error: unknown) => {
            // A thrown error is a failed checkout too — record it before delegating.
            cartCheckoutTotal.inc({ status: 'failure' });
            catchAs(response, 'postCheckout')(error);
        });
};
