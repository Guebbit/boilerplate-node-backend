import type { Request, Response } from 'express';
import { t } from 'i18next';
import { userService } from '@services/users';
import { successResponse, rejectResponse } from '@utils/response';
import type { RemoveCartItemRequest } from '@types';

/**
 * DELETE /cart/:productId
 * Remove a specific product from the cart. Returns the updated cart.
 */
export const deleteCartItem = (
    request: Request<{ productId?: string }, unknown, RemoveCartItemRequest>,
    response: Response
) => {
    // Authentication check is done before entering the route
    const user = request.user!;
    const productId = String(request.params.productId ?? request.body.productId);

    const existing = user.cart.items.find((i) => i.product.equals(productId));
    if (!existing) {
        rejectResponse(response, 404, 'Not Found', [t('ecommerce.product-not-found')]);
        return Promise.resolve();
    }

    return userService
        .cartItemRemoveById(user, productId)
        .then(() => userService.cartGetWithSummary(user))
        .then((cart) => {
            successResponse(response, cart);
        });
};
