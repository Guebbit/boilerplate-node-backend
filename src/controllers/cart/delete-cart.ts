import type { Request, Response } from 'express';
import { cartService } from '@services/cart';
import { successResponse } from '@utils/response';
import type { RemoveCartItemRequest } from '@types';
import { emitAnalyticsEvent, AnalyticsEvent } from '@utils/analytics';
import { getActiveSpanContext } from '@utils/tracer';

/**
 * DELETE /cart
 * Remove ALL items in the user cart.
 * If a productId is provided in the body, only that item is removed instead.
 */
export const deleteCart = (
    request: Request<unknown, unknown, RemoveCartItemRequest>,
    response: Response
) => {
    const auth = request.authContext!;
    const productId = String(request.body.productId);

    // Remove specific item or entire cart
    return (
        productId
            ? cartService.cartItemRemoveById(auth.id, productId)
            : cartService.cartRemove(auth.id)
    )
        .then(() => cartService.cartGetWithSummary(auth.id))
        .then((cart) => {
            emitAnalyticsEvent({
                distinctId: auth.id,
                event: AnalyticsEvent.CART_CLEARED,
                traceId: getActiveSpanContext().traceId,
                properties: { ...(productId ? { product_id: productId } : {}) }
            });
            successResponse(response, cart);
        });
};
