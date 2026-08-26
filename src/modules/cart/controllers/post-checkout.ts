import type { Request, Response } from 'express';
import { t } from '@infrastructure/i18n';
import { cartService } from '../services';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import { cartCheckoutTotal } from '../metrics';
import { authContextOf, callerContextOf } from '@infrastructure/http/request';

/**
 * POST /cart/checkout
 * Converts the cart into an order and clears the cart.
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
            if (!result.success) {
                cartCheckoutTotal.inc({ status: 'failure' });
                rejectResponse(response, result.status, result.errors);
                return;
            }
            cartCheckoutTotal.inc({ status: 'success' });
            successResponse(
                response,
                { order: result.data, message: t('orders.creation-success') },
                201
            );
        })
        .catch((error: Error) => {
            cartCheckoutTotal.inc({ status: 'failure' });
            rejectDatabaseError(response, 'postCheckout', error);
        });
};
