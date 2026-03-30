import type { Request, Response } from 'express';
import { t } from 'i18next';
import UserService from '@services/users';
import { successResponse, rejectResponse } from '@utils/response';
import { buildCartResponse } from './helpers';

/**
 * DELETE /cart/:productId
 * Removes a specific product from the cart. Returns the updated cart.
 */
const deleteCartById = async (request: Request, response: Response): Promise<void> => {
    const user = request.user!;
    const { productId } = request.params;
    const productIdString = String(productId);

    const existing = user.cart.items.find(i => i.product.equals(productIdString));
    if (!existing) {
        rejectResponse(response, 404, 'Not Found', [t('ecommerce.product-not-found')]);
        return;
    }

    await UserService.cartItemRemoveById(user, productIdString);
    await user.populate('cart.items.product');
    const cart = await buildCartResponse(user);
    successResponse(response, cart);
};

export default deleteCartById;
