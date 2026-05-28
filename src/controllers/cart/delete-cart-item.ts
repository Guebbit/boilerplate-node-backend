import type { Request, Response } from 'express';
import { t } from 'i18next';
import { cartService } from '@services/cart';
import { successResponse, rejectResponse } from '@utils/response';
import type { RemoveCartItemRequest } from '@types';
import { emitAnalyticsEvent, AnalyticsEvent } from '@utils/analytics';
import { getActiveSpanContext } from '@utils/tracer';

/**
 * DELETE /cart/:productId
 * Remove a specific product from the cart. Returns the updated cart.
 */
export const deleteCartItem = (
    request: Request<{ productId?: string }, unknown, RemoveCartItemRequest>,
    response: Response
) => {
    const auth = request.authContext!;
    const productId = String(request.params.productId ?? request.body.productId);

    // Attempt removal — service filters by product ID (no-op if not in cart)
    return cartService
        .cartItemRemoveById(auth.id, productId)
        .then(() => cartService.cartGetWithSummary(auth.id))
        .then((cart) => {
            emitAnalyticsEvent({
                distinctId: auth.id,
                event: AnalyticsEvent.CART_ITEM_REMOVED,
                traceId: getActiveSpanContext().traceId,
                properties: { product_id: productId }
            });
            successResponse(response, cart);
        });
};
