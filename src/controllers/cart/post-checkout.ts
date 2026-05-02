import type { Request, Response } from 'express';
import { t } from 'i18next';
import { userService } from '@services/users';
import { successResponse, rejectResponse } from '@utils/response';
import { cartCheckoutTotal } from '@utils/domain-metrics';

/**
 * POST /cart/checkout
 * Converts the cart into an order and clears the cart.
 */
export const postCheckout = (request: Request, response: Response) => {
    const user = request.user!;
    return userService.orderConfirm(user).then((result) => {
        if (!result.success) {
            cartCheckoutTotal.inc({ status: 'failure' });
            rejectResponse(response, result.status, result.message, result.errors);
            return;
        }
        cartCheckoutTotal.inc({ status: 'success' });
        successResponse(
            response,
            { order: result.data, message: t('ecommerce.order-creation-success') },
            201
        );
    });
};
