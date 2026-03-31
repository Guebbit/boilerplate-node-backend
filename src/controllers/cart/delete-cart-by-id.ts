import type { Request, Response } from 'express';
import { t } from 'i18next';
import UserService from '@services/users';
import { successResponse, rejectResponse } from '@utils/response';

/**
 * DELETE /cart/:productId
 * Remove a specific product from the cart. Returns the updated cart.
 */
const deleteCartById = (request: Request, response: Response): Promise<void> => {
    // Authentication check is done before entering the route
    const user = request.user!;
    const { productId } = request.params;
    const productIdString = String(productId);

    const existing = user.cart.items.find((i) => i.product.equals(productIdString));
    if (!existing) {
        rejectResponse(response, 404, 'Not Found', [t('ecommerce.product-not-found')]);
        return Promise.resolve();
    }

    return UserService.cartItemRemoveById(user, productIdString)
        .then(() => UserService.cartGetWithSummary(user))
        .then((cart) => {
            successResponse(response, cart);
        });
};

export default deleteCartById;
