import type { Request, Response } from 'express';
import { t } from 'i18next';
import { cartService } from '@services/cart';
import { successResponse, rejectResponse } from '@utils/response';
import type { UpdateCartItemByIdRequest } from '@types';
import { emitAnalyticsEvent, AnalyticsEvent, buildAnalyticsBase } from '@utils/analytics';

/**
 * PUT /cart/:productId
 * Set the quantity of a specific cart item. Returns the updated cart.
 */
export const putCartItem = (
    request: Request<{ productId?: string }, unknown, UpdateCartItemByIdRequest>,
    response: Response
) => {
    const userId = request.authContext!.id;
    const productId = String(request.params.productId ?? request.body.productId);

    if (!request.body.quantity || request.body.quantity < 1) {
        rejectResponse(response, 422, 'updateCartItemById - invalid quantity', [
            t('generic.error-invalid-data')
        ]);
        return Promise.resolve();
    }

    return cartService
        .cartItemSetById(userId, productId, request.body.quantity)
        .then(() => cartService.cartGetWithSummary(userId))
        .then((cart) => {
            emitAnalyticsEvent({
                ...buildAnalyticsBase(request),
                event: AnalyticsEvent.CART_ITEM_UPDATED,
                properties: { product_id: productId, quantity: request.body.quantity }
            });
            successResponse(response, cart);
        });
};
