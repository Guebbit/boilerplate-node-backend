import type { Request, Response } from 'express';
import { cartService } from '@services/cart';
import { successResponse, rejectResponse } from '@utils/response';
import type { RemoveCartItemRequest } from '@types';
import { emitAnalyticsEvent, AnalyticsEvent } from '@utils/analytics';
import { getActiveSpanContext } from '@utils/tracer';

/**
 * DELETE /cart/:productId
 * Remove a specific product from the cart. Returns the updated cart.
 * Service returns 404 if the item is not in the cart.
 */
export const deleteCartItem = (
    request: Request<{ productId?: string }, unknown, RemoveCartItemRequest>,
    response: Response
) => {
    const userId = request.authContext!.id;
    const productId = String(request.params.productId ?? request.body.productId);

    return cartService
        .cartItemRemoveById(userId, productId)
        .then((result) => {
            if (!result.success) {
                rejectResponse(response, result.status, result.message, result.errors);
                return;
            }
            return cartService.cartGetWithSummary(userId).then((cart) => {
                emitAnalyticsEvent({
                    distinctId: userId,
                    event: AnalyticsEvent.CART_ITEM_REMOVED,
                    traceId: getActiveSpanContext().traceId,
                    properties: { product_id: productId }
                });
                successResponse(response, cart);
            });
        });
};
