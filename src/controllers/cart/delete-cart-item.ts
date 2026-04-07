import type { Request, Response } from 'express';
import { t } from 'i18next';
import { cartService } from '@services/cart';
import { successResponse, rejectResponse } from '@utils/response';
import type { RemoveCartItemRequest } from '@types';

const getProductIdFromCartItem = (item: { product: unknown }) => {
    const product = item.product as { id?: number } | number;
    return typeof product === 'number' ? product : product.id;
};

/**
 * DELETE /cart/:productId
 * Remove a specific product from the cart. Returns the updated cart.
 */
export const deleteCartItem = (
    request: Request<{ productId?: string }, unknown, RemoveCartItemRequest>,
    response: Response
) => {
    const user = request.user!;
    const productId = String(request.params.productId ?? request.body.productId);

    return cartService
        .cartGet(user)
        .then((items) => {
            const existing = items.some(
                (item) =>
                    String(getProductIdFromCartItem(item as unknown as { product: unknown })) ===
                    String(productId)
            );

            if (!existing) {
                rejectResponse(response, 404, 'Not Found', [t('ecommerce.product-not-found')]);
                return;
            }

            return cartService
                .cartItemRemoveById(user, productId)
                .then(() => cartService.cartGetWithSummary(user))
                .then((cart) => {
                    successResponse(response, cart);
                });
        })
        .then(() => {});
};
