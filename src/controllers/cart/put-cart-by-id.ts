import type { Request, Response } from 'express';
import { t } from 'i18next';
import UserService from '@services/users';
import { successResponse, rejectResponse } from '@utils/response';
import type { UpdateCartItemByIdRequest } from '@types';
import { buildCartResponse } from './helpers';

/**
 * PUT /cart/:productId
 * Set the quantity of a specific cart item. Returns the updated cart.
 */
const putCartById = (request: Request<{ productId?: string }, unknown, UpdateCartItemByIdRequest>, response: Response): Promise<void> => {
    const user = request.user!;
    const productId = String(request.params);
    const { quantity } = request.body;

    if (!quantity || quantity < 1) {
        rejectResponse(response, 422, 'updateCartItemById - invalid quantity', [
            t('generic.error-invalid-data')
        ]);
        return Promise.resolve();
    }

    const existing = request.user!.cart.items.find((i) => i.product.equals(productId));
    if (!existing) {
        rejectResponse(response, 404, 'Not Found', [t('ecommerce.product-not-found')]);
        return Promise.resolve();
    }

    return UserService.cartItemSetById(user, productId, quantity)
        .then(() => user.populate('cart.items.product'))
        .then(() => buildCartResponse(user))
        .then((cart) => {
            successResponse(response, cart);
        });
};

export default putCartById;
