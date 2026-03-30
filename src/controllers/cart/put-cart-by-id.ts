import type { Request, Response } from 'express';
import { t } from 'i18next';
import UserService from '@services/users';
import { successResponse, rejectResponse } from '@utils/response';
import type { UpdateCartItemByIdRequest } from '../../../api/api';
import { buildCartResponse } from './helpers';

/**
 * PUT /cart/:productId
 * Set the quantity of a specific cart item. Returns the updated cart.
 */
const putCartById = async (request: Request, response: Response): Promise<void> => {
    const user = request.user!;
    const { productId } = request.params;
    const productIdString = String(productId);
    const { quantity } = request.body as UpdateCartItemByIdRequest;

    if (!quantity || quantity < 1) {
        rejectResponse(response, 422, 'updateCartItemById - invalid quantity', [t('generic.error-invalid-data')]);
        return;
    }

    const existing = user.cart.items.find(i => i.product.equals(productIdString));
    if (!existing) {
        rejectResponse(response, 404, 'Not Found', [t('ecommerce.product-not-found')]);
        return;
    }

    await UserService.cartItemSetById(user, productIdString, quantity);
    await user.populate('cart.items.product');
    const cart = await buildCartResponse(user);
    successResponse(response, cart);
};

export default putCartById;
