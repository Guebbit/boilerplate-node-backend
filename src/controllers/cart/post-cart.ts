import type { Request, Response } from 'express';
import { t } from 'i18next';
import { cartService } from '@services/cart';
import { productService } from '@services/products';
import { successResponse, rejectResponse } from '@utils/response';
import type { UpsertCartItemRequest } from '@types';
import { emitAnalyticsEvent, AnalyticsEvent, buildAnalyticsBase } from '@utils/analytics';

/**
 * POST /cart
 * Add a product (with its quantity) to the cart.
 * Checks product availability, then sets (or replaces) the quantity in the cart.
 */
export const postCart = (
    request: Request<unknown, unknown, UpsertCartItemRequest>,
    response: Response
) => {
    const userId = request.authContext!.id;
    const { productId, quantity } = request.body;

    if (!productId || !quantity || quantity < 1) {
        rejectResponse(response, 422, 'upsertCartItem - invalid data', [
            t('generic.error-invalid-data')
        ]);
        return Promise.resolve();
    }

    return productService.getById(productId).then((product) => {
        if (!product) {
            rejectResponse(response, 404, 'Not Found', [t('ecommerce.product-not-found')]);
            return;
        }

        return cartService
            .cartItemSetById(userId, productId, quantity)
            .then(() => cartService.cartGetWithSummary(userId))
            .then((cart) => {
                emitAnalyticsEvent({
                    ...buildAnalyticsBase(request),
                    event: AnalyticsEvent.CART_ITEM_ADDED,
                    properties: { product_id: productId, quantity }
                });
                successResponse(response, cart, 200, t('ecommerce.product-added-to-cart'));
            });
    });
};
