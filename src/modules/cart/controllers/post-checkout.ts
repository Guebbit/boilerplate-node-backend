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

/**
 * POST /cart/checkout
 * Converts the cart into an order and clears the cart.
 *
 * The one cart handler with something to do on BOTH sides of the branch: `cart_checkout_total` is
 * the business metric the observability overview reports, and a checkout that failed is exactly as
 * much of an outcome as one that succeeded. That is why the counter is incremented before
 * `refused()` rather than inside either arm — one increment per result, whichever way it went,
 * with no path through this handler that can answer and forget to record why.
 *
 * The rejection and the database failure are still the shared helpers' to send. Nothing about a
 * checkout makes its 409 or its 500 different from any other route's, and hand-writing them here
 * is how this file came to be the only cart controller that did.
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

            successResponse(
                response,
                { order: result.data, message: t('orders.creation-success') },
                201
            );
        })
        .catch((error: Error) => {
            // The third outcome, and the reason this `.catch` is spelled out rather than handed
            // straight to `catchAs`: a checkout that threw is a checkout that failed, and the
            // counter has to say so before the shared handler answers.
            cartCheckoutTotal.inc({ status: 'failure' });
            catchAs(response, 'postCheckout')(error);
        });
};
