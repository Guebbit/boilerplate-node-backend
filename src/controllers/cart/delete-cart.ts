import type { Request, Response } from 'express';
import { cartService } from '@services/cart';
import { successResponse, rejectResponse } from '@utils/response';
import type { RemoveCartItemRequest } from '@types';
import { emitAnalyticsEvent, AnalyticsEvent, buildAnalyticsBase } from '@utils/analytics';

/**
 * DELETE /cart
 * Remove ALL items in the user cart.
 * If a productId is provided in the body, only that item is removed instead.
 */
export const deleteCart = (
    request: Request<unknown, unknown, RemoveCartItemRequest>,
    response: Response
) => {
    const userId = request.authContext!.id;
    const productId = String(request.body.productId);

    return (
        productId ? cartService.cartItemRemoveById(userId, productId) : cartService.cartRemove(userId)
    )
        .then((result) => {
            if (result && !result.success) {
                rejectResponse(response, result.status, result.message, result.errors);
                return;
            }
            return cartService.cartGetWithSummary(userId).then((cart) => {
                emitAnalyticsEvent({
                    ...buildAnalyticsBase(request),
                    event: AnalyticsEvent.CART_CLEARED,
                    properties: { ...(productId ? { product_id: productId } : {}) }
                });
                successResponse(response, cart);
            });
        });
};
