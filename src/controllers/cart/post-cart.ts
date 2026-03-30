import type { Request, Response } from 'express';
import { t } from 'i18next';
import UserService from '@services/users';
import ProductService from '@services/products';
import { successResponse, rejectResponse } from '@utils/response';
import type { UpsertCartItemRequest } from '../../../api/api';
import { buildCartResponse } from './helpers';

/**
 * POST body data
 */
export interface IPostSetCartItemPostData {
    productId: string,
    quantity: number,
}

/**
 * POST /cart
 * Add a product (with its quantity) to the cart.
 * Checks product availability, then sets (or replaces) the quantity in the cart.
 */
const postCart = async (request: Request, response: Response): Promise<void> => {
    // Authentication check is done before entering the route
    const user = request.user!;
    const { productId, quantity } = request.body as UpsertCartItemRequest;

    if (!productId || !quantity || quantity < 1) {
        rejectResponse(response, 422, 'upsertCartItem - invalid data', [t('generic.error-invalid-data')]);
        return;
    }

    /**
     * Find product (active and not soft-deleted)
     */
    const product = await ProductService.getById(productId);
    if (!product) {
        rejectResponse(response, 404, 'Not Found', [t('ecommerce.product-not-found')]);
        return;
    }

    await UserService.cartItemSetById(user, productId, quantity);
    // Reload fresh user data after mutation
    await user.populate('cart.items.product');
    const cart = await buildCartResponse(user);
    successResponse(response, cart, 200, t('ecommerce.product-added-to-cart'));
};

export default postCart;
