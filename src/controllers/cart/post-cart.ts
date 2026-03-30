import type { Request, Response } from 'express';
import { t } from 'i18next';
import UserService from '@services/users';
import ProductService from '@services/products';
import { successResponse, rejectResponse } from '@utils/response';
import type { UpsertCartItemRequest } from '../../../api/api';
import { buildCartResponse } from './helpers';

/**
 * POST /cart
 * Add or set a product in the cart. Sets the quantity (replaces existing).
 */
const postCart = async (request: Request, response: Response): Promise<void> => {
    const user = request.user!;
    const { productId, quantity } = request.body as UpsertCartItemRequest;

    if (!productId || !quantity || quantity < 1) {
        rejectResponse(response, 422, 'upsertCartItem - invalid data', [t('generic.error-invalid-data')]);
        return;
    }

    const product = await ProductService.getById(productId);
    if (!product) {
        rejectResponse(response, 404, 'Not Found', [t('ecommerce.product-not-found')]);
        return;
    }

    await UserService.cartItemSetById(user, productId, quantity);
    // Reload fresh user data after mutation
    await user.populate('cart.items.product');
    const cart = await buildCartResponse(user);
    successResponse(response, cart);
};

export default postCart;
