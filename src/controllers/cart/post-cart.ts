import type { Request, Response } from 'express';
import { t } from 'i18next';
import UserService from '@services/users';
import ProductService from '@services/products';
import { successResponse, rejectResponse } from '@utils/response';
import type { UpsertCartItemRequest } from '@types';

/**
 * POST /cart
 * Add a product (with its quantity) to the cart.
 * Checks product availability, then sets (or replaces) the quantity in the cart.
 */
const postCart = (
    request: Request<unknown, unknown, UpsertCartItemRequest>,
    response: Response
) => {
    // Authentication check is done before entering the route
    const user = request.user!;
    const { productId, quantity } = request.body;

    if (!productId || !quantity || quantity < 1) {
        rejectResponse(response, 422, 'upsertCartItem - invalid data', [
            t('generic.error-invalid-data')
        ]);
        return Promise.resolve();
    }

    /**
     * Find product (active and not soft-deleted)
     */
    return ProductService.getById(productId).then((product) => {
        if (!product) {
            rejectResponse(response, 404, 'Not Found', [t('ecommerce.product-not-found')]);
            return;
        }

        return UserService.cartItemSetById(user, productId, quantity)
            .then(() => UserService.cartGetWithSummary(user))
            .then((cart) => {
                successResponse(response, cart, 200, t('ecommerce.product-added-to-cart'));
            });
    });
};

export default postCart;
